import { z } from 'zod';
import { clearSession, getSession, setSession } from '@/lib/auth/session-store';
import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiRequest } from './client';

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
