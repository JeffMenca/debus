/** @jest-environment node */
import { FRIENDLY_NETWORK_MESSAGE } from '@/lib/api/api-error';
import { callGatewayAuth } from './gateway-auth';

const fetchMock = jest.fn();
beforeEach(() => {
  process.env.API_URL = 'http://gateway.test/';
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('callGatewayAuth', () => {
  it('posts to the auth route and returns status and body', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }, { status: 200 }));

    await expect(callGatewayAuth('login', { a: 1 })).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.test/api/administracion/auth/login',
      expect.objectContaining({ method: 'POST', cache: 'no-store', body: '{"a":1}' }),
    );
  });

  it('returns a null body when the gateway sends none', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(callGatewayAuth('logout', {})).resolves.toEqual({ status: 204, body: null });
  });

  it('answers 503 with a friendly message when the gateway is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(callGatewayAuth('refresh', {})).resolves.toEqual({
      status: 503,
      body: { statusCode: 503, error: 'Service Unavailable', message: FRIENDLY_NETWORK_MESSAGE },
    });
  });
});
