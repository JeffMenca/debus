/** @jest-environment node */
import { POST as login } from './login/route';
import { POST as logout } from './logout/route';
import { POST as refresh } from './refresh/route';

const tokens = {
  accessToken: 'access',
  accessExpiresIn: 900,
  refreshToken: 'refresh-secret',
  refreshExpiresAt: '2026-10-16T12:00:00.000Z',
  user: {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    fullName: 'Ana',
    email: 'ana@correo.com',
    role: 'CLIENT',
    branchId: null,
  },
};
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000/api/sesion/${path}`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const gateway = jest.fn();
const sentBody = () => JSON.parse(gateway.mock.calls[0][1].body);

beforeEach(() => {
  process.env.API_URL = 'http://gateway.test';
  gateway.mockReset();
  global.fetch = gateway as unknown as typeof fetch;
});

describe('POST /api/sesion/login', () => {
  it('keeps the refresh token in an http only cookie and returns only the access token', async () => {
    gateway.mockResolvedValue(Response.json(tokens));

    const response = await login(post('login', { email: 'ana@correo.com', password: 'x' }));
    const body = await response.json();

    expect(gateway).toHaveBeenCalledWith(
      'http://gateway.test/api/administracion/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(body).toEqual({ accessToken: 'access', accessExpiresIn: 900, user: tokens.user });
    expect(JSON.stringify(body)).not.toContain('refresh-secret');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('debus_refresh=refresh-secret');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie).toContain('Path=/');
  });

  it('passes gateway errors through', async () => {
    gateway.mockResolvedValue(
      Response.json(
        {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'El correo o la contraseña no coinciden.',
        },
        { status: 401 },
      ),
    );

    const response = await login(post('login', { email: 'a@b.com', password: 'x' }));

    expect(response.status).toBe(401);
    expect((await response.json()).message).toBe('El correo o la contraseña no coinciden.');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('answers 502 when the gateway sends something that is not a session', async () => {
    gateway.mockResolvedValue(Response.json({ unexpected: true }));

    const response = await login(post('login', { email: 'a@b.com', password: 'x' }));

    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('forwards an empty body when the browser sends invalid JSON', async () => {
    gateway.mockResolvedValue(
      Response.json({ statusCode: 400, error: 'Bad Request', message: 'x' }, { status: 400 }),
    );
    const request = new Request('http://localhost:3000/api/sesion/login', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      body: 'not json',
    });

    const response = await login(request);

    expect(response.status).toBe(400);
    expect(sentBody()).toEqual({});
  });

  it('refuses requests from other sites', async () => {
    const response = await login(post('login', {}, { origin: 'https://evil.example' }));

    expect(response.status).toBe(403);
    expect(gateway).not.toHaveBeenCalled();
  });

  it('answers 503 with a friendly message when the gateway is unreachable', async () => {
    gateway.mockRejectedValue(new TypeError('fetch failed'));

    const response = await login(post('login', { email: 'a@b.com', password: 'x' }));

    expect(response.status).toBe(503);
  });
});

describe('POST /api/sesion/refresh', () => {
  it('rotates the cookie', async () => {
    gateway.mockResolvedValue(Response.json({ ...tokens, refreshToken: 'rotated' }));

    const response = await refresh(post('refresh', undefined, { cookie: 'debus_refresh=old' }));

    expect(sentBody()).toEqual({ refreshToken: 'old' });
    expect(response.headers.get('set-cookie')).toContain('debus_refresh=rotated');
    expect(JSON.stringify(await response.json())).not.toContain('rotated');
  });

  it('answers 204 without calling the gateway when there is no cookie', async () => {
    const missing = await refresh(post('refresh'));

    expect(missing.status).toBe(204);
    expect(await missing.text()).toBe('');
    expect(missing.headers.get('set-cookie')).toBeNull();
    expect(gateway).not.toHaveBeenCalled();
  });

  it('answers 401 and clears the cookie when the gateway refuses it', async () => {
    gateway.mockResolvedValue(
      Response.json({ statusCode: 401, error: 'Unauthorized', message: 'x' }, { status: 401 }),
    );
    const refused = await refresh(post('refresh', undefined, { cookie: 'debus_refresh=old' }));
    expect(refused.status).toBe(401);
    expect(refused.headers.get('set-cookie')).toContain('debus_refresh=;');
  });

  it('keeps the cookie when the gateway is unreachable', async () => {
    gateway.mockRejectedValue(new TypeError('fetch failed'));

    const response = await refresh(post('refresh', undefined, { cookie: 'debus_refresh=old' }));

    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('keeps the cookie when the gateway fails with a server error', async () => {
    gateway.mockResolvedValue(
      Response.json({ statusCode: 502, error: 'Bad Gateway', message: 'x' }, { status: 502 }),
    );

    const response = await refresh(post('refresh', undefined, { cookie: 'debus_refresh=old' }));

    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('refuses requests from other sites', async () => {
    const response = await refresh(post('refresh', undefined, { origin: 'https://evil.example' }));

    expect(response.status).toBe(403);
  });
});

describe('POST /api/sesion/logout', () => {
  it('revokes the session and always clears the cookie', async () => {
    gateway.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await logout(post('logout', undefined, { cookie: 'debus_refresh=old' }));

    expect(response.status).toBe(204);
    expect(sentBody()).toEqual({ refreshToken: 'old' });
    expect(response.headers.get('set-cookie')).toContain('debus_refresh=;');
  });

  it('clears the cookie even without a session', async () => {
    const response = await logout(post('logout'));

    expect(response.status).toBe(204);
    expect(gateway).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toContain('debus_refresh=;');
  });

  it('refuses requests from other sites', async () => {
    const response = await logout(post('logout', undefined, { origin: 'https://evil.example' }));

    expect(response.status).toBe(403);
  });
});
