import type { Server } from 'node:http';
import { probeStatusSchema, systemStatusSchema, topicName } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureGateway } from '../src/bootstrap';
import { pointServicesAt, received, startStub } from './support/stub';
import { bearer, useTestKeys } from './support/tokens';

const session = () => bearer({ role: 'CLIENT' });

describe('gateway', () => {
  let app: INestApplication;
  let stub: Server;

  beforeAll(async () => {
    useTestKeys();
    stub = await startStub();
    pointServicesAt(stub);

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
      .get('/api/flota/buses?status=active')
      .set('authorization', session())
      .set('x-correlation-id', 'c-1')
      .expect(200);

    expect(response.body.url).toBe('/flota/buses?status=active');
    expect(received.at(-1)?.headers['x-correlation-id']).toBe('c-1');
    expect(response.headers['x-correlation-id']).toBe('c-1');
  });

  it('forwards JSON bodies already parsed by Nest', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/ventas/eco')
      .set('authorization', session())
      .send({ a: 1 })
      .expect(200);

    expect(JSON.parse(response.body.body)).toEqual({ a: 1 });
  });

  it('hides internal endpoints and unknown services', async () => {
    const server = app.getHttpServer();
    const internal = await request(server)
      .post('/api/flota/events/pubsub')
      .set('authorization', session())
      .expect(404);
    await request(server).get('/api/desconocido/x').set('authorization', session()).expect(404);
    for (const path of [
      '/api/flota/outbox/flush',
      '/api/flota//outbox/flush',
      '/api/flota/OUTBOX/flush',
      '/api/flota//events/pubsub',
    ]) {
      await request(server).post(path).set('authorization', session()).expect(404);
    }

    expect(internal.body).toMatchObject({
      statusCode: 404,
      message: 'No encontramos lo que buscas.',
    });
  });

  it('answers 502 with a friendly message when a service is down', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/reportes/x')
      .set('authorization', session())
      .expect(502);

    expect(response.body.message).toBe(
      'El servicio no respondió. Intenta de nuevo en unos segundos.',
    );
  });

  it('reports the status of every unit', async () => {
    const response = await request(app.getHttpServer()).get('/api/system/status').expect(200);
    const status = systemStatusSchema.parse(response.body);

    expect(status.units).toHaveLength(8);
    expect(status.units.find((u) => u.unit === 'reportes')?.status).toBe('down');
    expect(status.units.find((u) => u.unit === 'flota')?.status).toBe('up');
  });

  it('emits a probe and reports who received it', async () => {
    const created = await request(app.getHttpServer()).post('/api/system/probes').expect(202);
    const response = await request(app.getHttpServer())
      .get(`/api/system/probes/${created.body.probeId}`)
      .expect(200);
    const status = probeStatusSchema.parse(response.body);

    expect(status.services.find((s) => s.service === 'flota')?.state).toBe('received');
    expect(status.services.find((s) => s.service === 'viajes')?.state).toBe('pending');
    expect(status.services.find((s) => s.service === 'reportes')?.state).toBe('unreachable');
  });

  it('rejects malformed probe ids with the common error', async () => {
    const response = await request(app.getHttpServer()).get('/api/system/probes/nope').expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('allows the configured web origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/system/status')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
