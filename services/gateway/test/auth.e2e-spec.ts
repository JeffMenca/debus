import type { Server } from 'node:http';
import { type AddressInfo, connect } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureGateway } from '../src/bootstrap';
import { pointServicesAt, received, startStub } from './support/stub';
import { bearer, useTestKeys } from './support/tokens';

// Raw socket, so nothing between the test and the gateway rewrites the request line.
function rawRequest(port: number, requestLine: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`${requestLine}\r\nHost: gateway.test\r\nConnection: close\r\n\r\n`);
    });
    let output = '';
    socket.on('data', (chunk) => (output += chunk.toString()));
    socket.on('end', () => resolve(output));
    socket.on('error', reject);
  });
}

const branch = '9b2c7a10-1111-4c4c-8888-123456789abc';
const forgedIdentity = {
  'x-user-id': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  'x-user-role': 'SYSTEM_ADMIN',
  'x-branch-id': branch,
};

describe('gateway authentication', () => {
  let app: INestApplication;
  let stub: Server;

  beforeAll(async () => {
    useTestKeys();
    stub = await startStub();
    pointServicesAt(stub);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureGateway(app);
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
    stub.close();
  });

  it('does not let an anonymous caller create an admin with an invented role header', async () => {
    const before = received.length;
    const attack = (path: string) =>
      request(app.getHttpServer())
        .post(path)
        .set(forgedIdentity)
        .send({ fullName: 'Intruso', email: 'x@correo.com', role: 'SYSTEM_ADMIN' });

    for (const path of [
      '/api/administracion/users',
      '/api/administracion/users/',
      '//api/administracion//users',
      '/API/Administracion/Users',
      '/api/administracion/auth/signup/../../users',
    ]) {
      const response = await attack(path);

      expect(response.status).toBeGreaterThanOrEqual(401);
      expect(response.status).toBeLessThanOrEqual(404);
      expect(response.body.message).not.toContain('SYSTEM_ADMIN');
    }
    const direct = await attack('/api/administracion/users').expect(401);

    expect(direct.body).toMatchObject({
      statusCode: 401,
      message: 'Tu sesión terminó. Inicia sesión de nuevo.',
    });
    expect(received.length).toBe(before);
  });

  it('lets the login through without a session and without forged identity', async () => {
    await request(app.getHttpServer())
      .post('/api/administracion/auth/login')
      .set(forgedIdentity)
      .send({ email: 'a@b.com', password: 'x' })
      .expect(200);

    const last = received.at(-1);
    expect(last?.url).toBe('/administracion/auth/login');
    expect(last?.headers['x-user-role']).toBeUndefined();
    expect(last?.headers['x-user-id']).toBeUndefined();
    expect(last?.headers['x-branch-id']).toBeUndefined();
  });

  it('stops protected routes without a valid token before reaching the service', async () => {
    const before = received.length;
    const server = app.getHttpServer();

    const missing = await request(server).get('/api/flota/buses').expect(401);
    await request(server).get('/api/flota/buses').set('authorization', 'Bearer x').expect(401);
    await request(server)
      .get('/api/flota/buses')
      .set('authorization', bearer({ role: 'CLIENT' }, { expiresIn: -5 }))
      .expect(401);

    expect(missing.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Tu sesión terminó. Inicia sesión de nuevo.',
    });
    expect(missing.headers['x-correlation-id']).toBeDefined();
    expect(missing.body.correlationId).toBe(missing.headers['x-correlation-id']);
    expect(received.length).toBe(before);
  });

  it('forwards only the identity of a valid token, whatever the client claims', async () => {
    await request(app.getHttpServer())
      .get('/api/administracion/auth/me')
      .set('authorization', bearer({ role: 'CASHIER', branchId: branch }))
      .set(forgedIdentity)
      .set('x-user-role', 'SYSTEM_ADMIN')
      .expect(200);

    expect(received.at(-1)?.headers).toMatchObject({
      'x-user-id': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'x-user-role': 'CASHIER',
      'x-branch-id': branch,
    });
  });

  it('does not forward a branch for users that have none', async () => {
    await request(app.getHttpServer())
      .get('/api/administracion/auth/me')
      .set('authorization', bearer({ role: 'CLIENT' }))
      .set('x-branch-id', branch)
      .expect(200);

    expect(received.at(-1)?.headers['x-user-role']).toBe('CLIENT');
    expect(received.at(-1)?.headers['x-branch-id']).toBeUndefined();
  });

  it('lets only system admins read the system status', async () => {
    const server = app.getHttpServer();

    await request(server).get('/api/system/status').expect(401);
    await request(server)
      .get('/api/system/status')
      .set('authorization', bearer({ role: 'CLIENT' }))
      .expect(403);
    await request(server)
      .get('/api/system/status')
      .set('authorization', bearer({ role: 'SYSTEM_ADMIN' }))
      .expect(200);
  });

  it('answers CORS preflights without a session', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/flota/buses')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBeLessThan(300);
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
  });

  it('refuses absolute-form request targets before any routing decision', async () => {
    const before = received.length;
    const { port } = app.getHttpServer().address() as AddressInfo;

    for (const target of [
      'http://gateway.test/api/flota/buses',
      'HTTP://gateway.test/api/administracion/users',
      'http://gateway.test/health',
    ]) {
      const response = await rawRequest(port, `GET ${target} HTTP/1.1`);

      expect(response.split('\r\n')[0]).toContain('400');
      expect(response).toContain('"statusCode":400');
    }
    expect(received.length).toBe(before);
  });

  it('does not forward identity headers spelled with underscores', async () => {
    await request(app.getHttpServer())
      .get('/api/administracion/auth/me')
      .set('authorization', bearer({ role: 'CLIENT' }))
      .set({
        x_user_id: forgedIdentity['x-user-id'],
        x_user_role: 'SYSTEM_ADMIN',
        x_branch_id: branch,
      })
      .expect(200);

    const headers = received.at(-1)?.headers ?? {};
    expect(headers['x-user-role']).toBe('CLIENT');
    expect(Object.keys(headers).filter((name) => name.startsWith('x_'))).toEqual([]);
  });

  it('keeps internal endpoints unreachable through dot segments and parameters', async () => {
    const before = received.length;

    for (const path of [
      '/./outbox/flush',
      '/;/outbox/flush',
      '/outbox;/flush',
      '/./events/pubsub',
    ]) {
      await request(app.getHttpServer())
        .post(`/api/flota${path}`)
        .set('authorization', bearer({ role: 'SYSTEM_ADMIN' }))
        .expect(404);
    }
    expect(received.length).toBe(before);
  });
});
