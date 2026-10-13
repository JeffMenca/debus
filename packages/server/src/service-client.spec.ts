import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  ServiceHttpClient,
  ServiceRejectedError,
  ServiceUnavailableError,
  serviceUrlsFromEnv,
} from './service-client';

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
