import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { probeStatusSchema, systemStatusSchema, topicName } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureGateway } from '../src/bootstrap';

const received: { url?: string; headers: IncomingMessage['headers'] }[] = [];

// One stub plays every backend under /<service>; reportes points to a closed port.
function startStub(): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers });
      const json = (status: number, value: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
      if (req.url?.endsWith('/health')) return json(200, { status: 'ok' });
      if (req.url?.startsWith('/flota/events/processed/')) {
        return json(200, { processedAt: '2026-10-06T12:00:00.000Z' });
      }
      if (req.url?.includes('/events/processed/')) return json(404, {});
      return json(200, { url: req.url, body });
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

describe('gateway', () => {
  let app: INestApplication;
  let stub: Server;

  beforeAll(async () => {
    stub = await startStub();
    const base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
    for (const service of [
      'administracion',
      'flota',
      'viajes',
      'ventas',
      'clientes',
      'notificaciones',
    ]) {
      process.env[`SERVICE_URL_${service.toUpperCase()}`] = `${base}/${service}`;
    }
    process.env.SERVICE_URL_REPORTES = 'http://127.0.0.1:1';

    const pubsub = new PubSub({ projectId: process.env.PUBSUB_PROJECT_ID });
    const [exists] = await pubsub.topic(topicName('gateway')).exists();
    if (!exists) await pubsub.createTopic(topicName('gateway'));
    await pubsub.close();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureGateway(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    stub.close();
  });

  it('proxies by prefix keeping path, query and correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/flota/buses?estado=activo')
      .set('x-correlation-id', 'c-1')
      .expect(200);

    expect(response.body.url).toBe('/flota/buses?estado=activo');
    expect(received.at(-1)?.headers['x-correlation-id']).toBe('c-1');
    expect(response.headers['x-correlation-id']).toBe('c-1');
  });

  it('forwards JSON bodies already parsed by Nest', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ventas/eco')
      .send({ a: 1 })
      .expect(200);

    expect(JSON.parse(response.body.body)).toEqual({ a: 1 });
  });

  it('hides internal endpoints and unknown services', async () => {
    const internal = await request(app.getHttpServer())
      .post('/api/flota/events/pubsub')
      .expect(404);
    await request(app.getHttpServer()).get('/api/desconocido/x').expect(404);

    expect(internal.body).toMatchObject({
      statusCode: 404,
      message: 'No encontramos lo que buscas.',
    });
  });

  it('answers 502 with a friendly message when a service is down', async () => {
    const response = await request(app.getHttpServer()).get('/api/reportes/x').expect(502);

    expect(response.body.message).toBe(
      'El servicio no respondió. Intenta de nuevo en unos segundos.',
    );
  });

  it('reports the status of every unit', async () => {
    const response = await request(app.getHttpServer()).get('/api/sistema/estado').expect(200);
    const status = systemStatusSchema.parse(response.body);

    expect(status.units).toHaveLength(8);
    expect(status.units.find((u) => u.unit === 'reportes')?.status).toBe('down');
    expect(status.units.find((u) => u.unit === 'flota')?.status).toBe('up');
  });

  it('emits a probe and reports who received it', async () => {
    const created = await request(app.getHttpServer()).post('/api/sistema/sondeos').expect(202);
    const response = await request(app.getHttpServer())
      .get(`/api/sistema/sondeos/${created.body.probeId}`)
      .expect(200);
    const status = probeStatusSchema.parse(response.body);

    expect(status.services.find((s) => s.service === 'flota')?.state).toBe('received');
    expect(status.services.find((s) => s.service === 'viajes')?.state).toBe('pending');
    expect(status.services.find((s) => s.service === 'reportes')?.state).toBe('unreachable');
  });

  it('rejects malformed probe ids with the common error', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/sistema/sondeos/nope')
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('allows the configured web origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/sistema/estado')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
