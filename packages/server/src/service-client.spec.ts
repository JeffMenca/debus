import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { SERVER_MESSAGES } from './messages';
import {
  ServiceHttpClient,
  ServiceRejectedError,
  ServiceUnavailableError,
  serviceUrlsFromEnv,
} from './service-client';
import { CircuitOpenError } from './service-errors';

const tokens = {
  headersFor: jest.fn().mockResolvedValue({ 'x-serverless-authorization': 'Bearer t' }),
};
const urls = { flota: 'http://flota' } as never;
const schema = z.object({ ok: z.boolean() });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ServiceHttpClient', () => {
  // Restoring a spy on the global fetch removes the property from the test sandbox, so the global is swapped.
  const realFetch = global.fetch;
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('calls the peer with an identity token and the correlation id, and validates the answer', async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));
    const client = new ServiceHttpClient(tokens as never, urls);

    await expect(
      client.get('flota', '/internal/availability?x=1', schema, { correlationId: 'c1' }),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://flota/internal/availability?x=1');
    expect(init?.headers).toMatchObject({
      'x-serverless-authorization': 'Bearer t',
      'x-correlation-id': 'c1',
    });
    expect(init?.signal).toBeDefined();
  });

  it('retries a read twice and then gives up as unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const client = new ServiceHttpClient(tokens as never, urls, { retryDelayMs: 0 });

    await expect(client.get('flota', '/x', schema)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a read after a 503 but never after a 4xx', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ ok: true }));
    const client = new ServiceHttpClient(tokens as never, urls, { retryDelayMs: 0 });

    await expect(client.get('flota', '/x', schema)).resolves.toEqual({ ok: true });

    fetchMock.mockReset().mockResolvedValue(json({ message: 'no' }, 404));
    await expect(client.get('flota', '/x', schema)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up as unavailable when a read keeps answering 5xx', async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    const client = new ServiceHttpClient(tokens as never, urls, { retryDelayMs: 0 });

    await expect(client.get('flota', '/x', schema)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries a write and sends its Idempotency-Key', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const client = new ServiceHttpClient(tokens as never, urls, { retryDelayMs: 0 });

    await expect(
      client.post('flota', '/x', { a: 1 }, schema, { idempotencyKey: 'k1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'idempotency-key': 'k1',
      'content-type': 'application/json',
    });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('keeps the status and the message of a 4xx for the caller to turn into its own rule', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Saldo insuficiente' }, 409));
    const client = new ServiceHttpClient(tokens as never, urls);

    const error = await client
      .post('flota', '/x', {}, schema, { idempotencyKey: 'k' })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ServiceRejectedError);
    expect(error).toMatchObject({ status: 409, message: 'Saldo insuficiente' });
    expect((error as ServiceRejectedError).body).toEqual({ message: 'Saldo insuficiente' });
  });

  it('uses the generic text when a 4xx has no message', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 400 }));
    const client = new ServiceHttpClient(tokens as never, urls);

    await expect(client.get('flota', '/x', schema)).rejects.toMatchObject({
      status: 400,
      message: 'Algo salió mal. Intenta de nuevo en unos segundos.',
    });
  });

  it('turns a refusal that is not a business answer into a bad gateway, never into the status of the peer', async () => {
    const client = new ServiceHttpClient(tokens as never, urls);

    for (const status of [401, 403, 405, 415, 429]) {
      fetchMock.mockReset().mockResolvedValue(json({ message: 'Unauthorized' }, status));
      const error = await client.get('flota', '/x', schema).catch((reason: unknown) => reason);

      expect(error).toMatchObject({ status: status === 429 ? 503 : 502 });
      expect(error).not.toBeInstanceOf(ServiceRejectedError);
    }
  });

  it('keeps the status of the answers a caller turns into its own rules', async () => {
    const client = new ServiceHttpClient(tokens as never, urls);

    for (const status of [400, 404, 409, 422]) {
      fetchMock.mockReset().mockResolvedValue(json({ message: 'nope' }, status));

      await expect(client.get('flota', '/x', schema)).rejects.toMatchObject({ status });
    }
  });

  it('logs every failed attempt with the service, the path and the cause, and never the query', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json({}, 503));
    fetchMock.mockResolvedValue(json({ ok: true }));
    const client = new ServiceHttpClient(tokens as never, urls, { retryDelayMs: 0 });

    await client.get('flota', '/internal/availability?busId=secret', schema, {
      correlationId: 'c1',
    });

    expect(warn).toHaveBeenNthCalledWith(
      1,
      {
        service: 'flota',
        path: '/internal/availability',
        correlationId: 'c1',
        cause: 'fetch failed',
      },
      'Call to another service failed',
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      {
        service: 'flota',
        path: '/internal/availability',
        correlationId: 'c1',
        status: 503,
      },
      'Call to another service failed',
    );
    warn.mockRestore();
  });

  it('treats an answer that breaks the contract as a bad gateway', async () => {
    fetchMock.mockResolvedValue(json({ ok: 'yes' }));
    const client = new ServiceHttpClient(tokens as never, urls);

    await expect(client.get('flota', '/x', schema)).rejects.toMatchObject({ status: 502 });
  });

  it('refuses to call a service whose URL is not configured', async () => {
    const client = new ServiceHttpClient(tokens as never, {});

    await expect(client.get('flota', '/x', schema)).rejects.toThrow('No URL configured for flota');
  });
});

describe('ServiceHttpClient circuit breaker', () => {
  const realFetch = global.fetch;
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const peers = { flota: 'http://flota', viajes: 'http://viajes' } as never;
  const clock = { now: 1_000_000 };
  const options = {
    retryDelayMs: 0,
    circuit: { failureThreshold: 5, openMs: 30_000, now: () => clock.now },
  };
  const down = () => fetchMock.mockRejectedValue(new TypeError('fetch failed'));

  beforeEach(() => {
    fetchMock.mockReset();
    clock.now = 1_000_000;
    tokens.headersFor.mockResolvedValue({ 'x-serverless-authorization': 'Bearer t' });
    global.fetch = fetchMock as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  async function openFlota(client: ServiceHttpClient) {
    down();
    for (let i = 0; i < 5; i++) {
      await client.post('flota', '/x', {}, schema, { idempotencyKey: 'k' }).catch(() => null);
    }
    fetchMock.mockClear();
  }

  it('opens after 5 failed attempts and then answers without calling the peer', async () => {
    const client = new ServiceHttpClient(tokens as never, peers, options);
    await openFlota(client);

    const error = await client.get('flota', '/x', schema).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CircuitOpenError);
    expect(error).toMatchObject({ status: 503, message: SERVER_MESSAGES.paused });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.isOpen('flota')).toBe(true);
  });

  it('stops retrying a read when the circuit opens halfway', async () => {
    const client = new ServiceHttpClient(tokens as never, peers, {
      ...options,
      circuit: { ...options.circuit, failureThreshold: 2 },
    });
    down();

    const error = await client.get('flota', '/x', schema).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CircuitOpenError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a separate circuit for each peer', async () => {
    const client = new ServiceHttpClient(tokens as never, peers, options);
    await openFlota(client);
    fetchMock.mockReset().mockResolvedValue(json({ ok: true }));

    await expect(client.get('viajes', '/x', schema)).resolves.toEqual({ ok: true });

    expect(client.isOpen('flota')).toBe(true);
    expect(client.isOpen('viajes')).toBe(false);
  });

  it.each([
    ['a 422', () => json({ message: 'no' }, 422)],
    ['a 404', () => json({ message: 'no' }, 404)],
    ['a 401', () => json({ message: 'no' }, 401)],
    ['an answer that breaks the contract', () => json({ ok: 'no' })],
  ])('does not count %s as a failure', async (_case, answer) => {
    const client = new ServiceHttpClient(tokens as never, peers, options);

    for (let calls = 0; calls < 6; calls++) {
      fetchMock.mockResolvedValueOnce(answer());
      await client.get('flota', '/x', schema).catch(() => null);
    }

    expect(client.isOpen('flota')).toBe(false);
    expect(client.circuits()[0]).toMatchObject({ target: 'flota', state: 'closed', failures: 0 });
  });

  it('counts a failure to build the headers and does not leave the probe stuck', async () => {
    const client = new ServiceHttpClient(tokens as never, peers, options);
    tokens.headersFor.mockRejectedValue(new Error('no token'));
    for (let i = 0; i < 5; i++) await client.get('flota', '/x', schema).catch(() => null);
    expect(client.isOpen('flota')).toBe(true);
    clock.now += 30_000;

    await client.get('flota', '/x', schema).catch(() => null);

    expect(client.isOpen('flota')).toBe(true);
    expect(client.circuits()[0]?.state).toBe('open');
    clock.now += 30_000;
    tokens.headersFor.mockResolvedValue({});
    fetchMock.mockResolvedValue(json({ ok: true }));
    await expect(client.get('flota', '/x', schema)).resolves.toEqual({ ok: true });
    expect(client.circuits()[0]?.state).toBe('closed');
  });

  it('lets one probe through after the pause and closes when it works', async () => {
    const client = new ServiceHttpClient(tokens as never, peers, options);
    await openFlota(client);
    clock.now += 30_000;
    fetchMock.mockResolvedValue(json({ ok: true }));

    expect(client.isOpen('flota')).toBe(false);
    await expect(client.get('flota', '/x', schema)).resolves.toEqual({ ok: true });

    expect(client.circuits()[0]).toMatchObject({ state: 'closed', failures: 0, retryAt: null });
  });

  it('lists only the peers that have a URL, in the order of the services', () => {
    const client = new ServiceHttpClient(
      tokens as never,
      { viajes: 'http://viajes', flota: 'http://flota' } as never,
      options,
    );

    expect(client.circuits().map((circuit) => circuit.target)).toEqual(['flota', 'viajes']);
    expect(client.isOpen('clientes')).toBe(false);
  });

  it('shows the pause in the circuits list with the time it will try again', async () => {
    const client = new ServiceHttpClient(tokens as never, peers, options);
    await openFlota(client);

    expect(client.circuits()[0]).toEqual({
      target: 'flota',
      state: 'open',
      failures: 5,
      retryAt: new Date(clock.now + 30_000).toISOString(),
    });
    clock.now += 30_000;
    expect(client.circuits()[0]?.state).toBe('half-open');
  });

  it('logs each change of state in English with the service and the failures', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const client = new ServiceHttpClient(tokens as never, peers, options);
    await openFlota(client);
    clock.now += 30_000;
    fetchMock.mockResolvedValue(json({ ok: true }));
    await client.get('flota', '/x?secret=1', schema);

    const lines = warn.mock.calls
      .filter(([, message]) => String(message).startsWith('Circuit'))
      .map(([context, message]) => [message, context]);
    expect(lines).toEqual([
      ['Circuit opened', { service: 'flota', failures: 5 }],
      ['Circuit half-open', { service: 'flota', failures: 5 }],
      ['Circuit closed', { service: 'flota', failures: 0 }],
    ]);
    warn.mockRestore();
  });
});

describe('serviceUrlsFromEnv', () => {
  it('reads the URL of every peer that the environment configures', () => {
    expect(
      serviceUrlsFromEnv({
        SERVICE_URL_FLOTA: 'http://flota',
        SERVICE_URL_VIAJES: 'http://viajes',
        SERVICE_URL_CLIENTES: '',
        OTHER: 'x',
      }),
    ).toEqual({ flota: 'http://flota', viajes: 'http://viajes' });
    expect(serviceUrlsFromEnv({})).toEqual({});
  });
});
