import { z } from 'zod';
import { clearSession, getSession, setSession } from '@/lib/auth/session-store';
import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiBlob, apiRequest, noContent } from './client';

const schema = z.object({ ok: z.boolean() });

describe('apiRequest', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls the gateway and validates the response', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ ok: true }));

    await expect(apiRequest('/api/system/status', schema)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/system/status',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }),
    );
  });

  it('turns network failures into a friendly error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/x', schema)).rejects.toEqual(
      new ApiError(0, FRIENDLY_NETWORK_MESSAGE),
    );
  });

  it('keeps the gateway message and correlation id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json(
        {
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'El servicio no respondió.',
          correlationId: 'c',
        },
        { status: 502 },
      ),
    );

    const error = await apiRequest('/x', schema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      message: 'El servicio no respondió.',
      correlationId: 'c',
    });
  });

  it('uses the friendly message when the error body is unknown', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));

    await expect(apiRequest('/x', schema)).rejects.toMatchObject({
      status: 500,
      message: FRIENDLY_NETWORK_MESSAGE,
    });
  });
});

describe('apiRequest with a session', () => {
  const session = {
    accessToken: 'old',
    accessExpiresIn: 900,
    user: {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      fullName: 'Ana',
      email: 'a@b.com',
      role: 'CLIENT' as const,
      branchId: null,
    },
  };
  const unauthorized = () =>
    Response.json({ statusCode: 401, error: 'Unauthorized', message: 'x' }, { status: 401 });
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    setSession(session);
  });
  afterEach(() => clearSession());

  it('sends the access token', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));

    await apiRequest('/api/x', schema);

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer old');
  });

  it('renews once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json({ ...session, accessToken: 'new' }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    await apiRequest('/api/x', schema);

    expect(fetchMock.mock.calls[1][0]).toBe('/api/session/refresh');
    expect(fetchMock.mock.calls[2][1].headers.authorization).toBe('Bearer new');
  });

  it('renews only once: a second 401 after renewing is the answer', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json({ ...session, accessToken: 'new' }))
      .mockResolvedValueOnce(unauthorized());

    await expect(apiRequest('/api/x', schema)).rejects.toMatchObject({ status: 401 });

    // The request, one renewal, the retry; nothing more.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/session/refresh')).toHaveLength(1);
  });

  it('reports a connection problem, not an ended session, when the renewal cannot reach the server', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(apiRequest('/api/x', schema)).rejects.toMatchObject({
      status: 0,
      message: FRIENDLY_NETWORK_MESSAGE,
    });
    expect(getSession()?.accessToken).toBe('old');
  });

  it('gives up when the session cannot be renewed', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Tu sesión terminó. Inicia sesión de nuevo.',
          },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(apiRequest('/api/x', schema)).rejects.toMatchObject({ status: 401 });
  });
});

describe('apiRequest without a session', () => {
  it('does not try to renew a 401', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        Response.json({ statusCode: 401, error: 'Unauthorized', message: 'x' }, { status: 401 }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiRequest('/api/x', schema)).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('noContent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts an answer without a body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest('/x', noContent, { method: 'POST' })).resolves.toBeNull();
  });
});

describe('apiRequest with a FormData body', () => {
  afterEach(() => jest.restoreAllMocks());

  it('leaves the content type to the browser so it adds the multipart boundary', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const form = new FormData();
    form.append('photo', new Blob(['x']), 'bus.jpg');

    await apiRequest('/api/flota/buses/1/photo', noContent, { method: 'PUT', body: form });

    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty('content-type');
  });

  it('still sends JSON bodies as JSON', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ ok: true }));

    await apiRequest('/x', schema, { method: 'POST', body: '{}' });

    expect((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).headers).toHaveProperty(
      'content-type',
      'application/json',
    );
  });
});

describe('apiBlob', () => {
  const session = {
    accessToken: 'old',
    accessExpiresIn: 900,
    user: {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      fullName: 'Ana',
      email: 'a@b.com',
      role: 'BRANCH_ADMIN' as const,
      branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
    },
  };
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    setSession(session);
  });
  afterEach(() => clearSession());

  it('reads an image with the session token', async () => {
    fetchMock.mockResolvedValue(new Response('img', { headers: { 'content-type': 'image/jpeg' } }));

    const blob = await apiBlob('/api/flota/buses/1/photo');

    expect(blob.type).toBe('image/jpeg');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer old');
  });

  it('renews the session once on 401, like any other request', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ statusCode: 401, error: 'Unauthorized', message: 'x' }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ ...session, accessToken: 'new' }))
      .mockResolvedValueOnce(new Response('img', { headers: { 'content-type': 'image/png' } }));

    const blob = await apiBlob('/api/flota/buses/1/photo');

    expect(blob.type).toBe('image/png');
    expect(fetchMock.mock.calls[2][1].headers.authorization).toBe('Bearer new');
  });

  it('fails with the service message when there is no photo', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { statusCode: 404, error: 'Not Found', message: 'Aún no tiene foto.' },
        { status: 404 },
      ),
    );

    await expect(apiBlob('/api/flota/buses/1/photo')).rejects.toMatchObject({
      status: 404,
      message: 'Aún no tiene foto.',
    });
  });

  it('reports a connection problem when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiBlob('/x')).rejects.toEqual(new ApiError(0, FRIENDLY_NETWORK_MESSAGE));
  });
});
