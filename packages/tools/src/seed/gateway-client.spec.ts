import { z } from 'zod';
import { GatewayClient, GatewayError, type Session } from './gateway-client';

const USER = {
  id: '4c3b6a5e-1f2d-4e8a-9b7c-0d1e2f3a4b5c',
  fullName: 'Ana Admin',
  email: 'ana@debus.test',
  role: 'BRANCH_ADMIN',
  branchId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
};
const TOKENS = {
  accessToken: 'token-1',
  accessExpiresIn: 900,
  refreshToken: 'refresh-1',
  refreshExpiresAt: '2026-10-22T00:00:00.000Z',
  user: USER,
};

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type Call = { url: string; init: RequestInit };
function fakeFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  const impl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}
const headerOf = (call: Call | undefined, name: string) =>
  new Headers(call?.init.headers).get(name);

describe('GatewayClient', () => {
  describe('login', () => {
    it('posts the credentials and returns the session', async () => {
      const { impl, calls } = fakeFetch(json(200, TOKENS));
      const session = await new GatewayClient('http://gw:4000/', impl).login(
        'ana@debus.test',
        'pw',
      );
      expect(session).toEqual({ accessToken: 'token-1', user: USER });
      expect(calls[0]?.url).toBe('http://gw:4000/api/administracion/auth/login');
      expect(calls[0]?.init.method).toBe('POST');
      expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
        email: 'ana@debus.test',
        password: 'pw',
      });
    });

    it('fails with the status of a wrong password', async () => {
      const { impl } = fakeFetch(
        json(401, { statusCode: 401, message: 'Correo o contraseña incorrectos.' }),
      );
      await expect(new GatewayClient('http://gw', impl).login('a@b.co', 'x')).rejects.toMatchObject(
        {
          status: 401,
          message: 'Correo o contraseña incorrectos.',
        },
      );
    });
  });

  describe('request', () => {
    const session: Session = {
      accessToken: 'token-1',
      user: { ...USER, role: 'BRANCH_ADMIN' } as Session['user'],
    };

    it('sends the bearer token, JSON and the seed correlation id', async () => {
      const { impl, calls } = fakeFetch(json(201, { id: '1' }));
      const result = await new GatewayClient('http://gw', impl).request(
        session,
        'POST',
        '/api/flota/buses',
        { plate: 'C482BTX' },
      );
      expect(result).toEqual({ id: '1' });
      expect(headerOf(calls[0], 'authorization')).toBe('Bearer token-1');
      expect(headerOf(calls[0], 'content-type')).toBe('application/json');
      expect(headerOf(calls[0], 'x-correlation-id')).toMatch(/^seed-/);
      expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ plate: 'C482BTX' });
    });

    it('sends no token and no body when there is no session and no body', async () => {
      const { impl, calls } = fakeFetch(json(200, { ok: true }));
      await new GatewayClient('http://gw', impl).request(null, 'GET', '/health');
      expect(headerOf(calls[0], 'authorization')).toBeNull();
      expect(headerOf(calls[0], 'content-type')).toBeNull();
      expect(calls[0]?.init.body).toBeUndefined();
    });

    it('returns undefined for an empty answer', async () => {
      const { impl } = fakeFetch(new Response(null, { status: 204 }));
      await expect(
        new GatewayClient('http://gw', impl).request(
          session,
          'POST',
          '/api/flota/buses/1/deactivate',
        ),
      ).resolves.toBeUndefined();
    });

    it.each([
      [400, { statusCode: 400, message: 'Datos no válidos.' }, 'Datos no válidos.'],
      [500, { statusCode: 500, message: 'Algo falló.' }, 'Algo falló.'],
    ])('throws a GatewayError with the message of a %s', async (status, body, message) => {
      const { impl } = fakeFetch(json(status, body));
      const error = await new GatewayClient('http://gw', impl)
        .request(session, 'GET', '/api/flota/buses')
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(GatewayError);
      expect(error).toMatchObject({ status, message });
    });

    it('falls back to the status text when the body is not JSON', async () => {
      const { impl } = fakeFetch(
        new Response('<html>', { status: 502, statusText: 'Bad Gateway' }),
      );
      await expect(
        new GatewayClient('http://gw', impl).request(session, 'GET', '/api/flota/buses'),
      ).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
    });

    it('validates the answer with the schema', async () => {
      const schema = z.object({ id: z.string() });
      const ok = fakeFetch(json(200, { id: 'a' }));
      await expect(
        new GatewayClient('http://gw', ok.impl).request(session, 'GET', '/x', undefined, schema),
      ).resolves.toEqual({ id: 'a' });
      const bad = fakeFetch(json(200, { id: 5 }));
      await expect(
        new GatewayClient('http://gw', bad.impl).request(session, 'GET', '/x', undefined, schema),
      ).rejects.toThrow('GET /x');
    });

    it('signs in again once when the access token expired', async () => {
      const { impl, calls } = fakeFetch(
        json(200, TOKENS),
        json(401, { message: 'Tu sesión terminó.' }),
        json(200, { ...TOKENS, accessToken: 'token-2' }),
        json(200, { id: '1' }),
      );
      const client = new GatewayClient('http://gw', impl);
      const live = await client.login('ana@debus.test', 'pw');
      await expect(client.request(live, 'GET', '/api/flota/buses')).resolves.toEqual({ id: '1' });
      expect(live.accessToken).toBe('token-2');
      expect(headerOf(calls[3], 'authorization')).toBe('Bearer token-2');
    });

    it('does not sign in again twice in a row', async () => {
      const { impl } = fakeFetch(
        json(200, TOKENS),
        json(401, { message: 'no' }),
        json(200, TOKENS),
        json(401, { message: 'no' }),
      );
      const client = new GatewayClient('http://gw', impl);
      const live = await client.login('ana@debus.test', 'pw');
      await expect(client.request(live, 'GET', '/x')).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('upload', () => {
    it('sends the file as multipart under the photo field', async () => {
      const { impl, calls } = fakeFetch(new Response(null, { status: 204 }));
      await new GatewayClient('http://gw', impl).upload(
        { accessToken: 'token-1', user: USER as Session['user'] },
        '/api/flota/buses/1/photo',
        { name: 'bus.png', type: 'image/png', data: Buffer.from([1, 2, 3]) },
      );
      expect(calls[0]?.init.method).toBe('PUT');
      expect(headerOf(calls[0], 'authorization')).toBe('Bearer token-1');
      const form = calls[0]?.init.body as FormData;
      const file = form.get('photo') as File;
      expect(file.name).toBe('bus.png');
      expect(file.type).toBe('image/png');
      expect(file.size).toBe(3);
    });

    it('throws a GatewayError when the upload is rejected', async () => {
      const { impl } = fakeFetch(json(400, { message: 'Sube una foto JPG.' }));
      await expect(
        new GatewayClient('http://gw', impl).upload(
          { accessToken: 't', user: USER as Session['user'] },
          '/p',
          { name: 'a.txt', type: 'text/plain', data: Buffer.from('x') },
        ),
      ).rejects.toMatchObject({ status: 400, message: 'Sube una foto JPG.' });
    });
  });
});
