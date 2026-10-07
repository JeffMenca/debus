import 'reflect-metadata';
import { createEnvelope } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EventPublisher, InMemoryInboxStore, MessagingModule } from '../src';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64') },
  subscription: 'test',
});

describe('MessagingModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({
          service: 'flota',
          inbox: { useFactory: () => new InMemoryInboxStore() },
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('records a probe once and exposes it', async () => {
    const envelope = createEnvelope(
      'SondeoEmitido',
      { requestedAt: new Date().toISOString() },
      'c',
    );
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    const response = await request(server).get(`/events/processed/${envelope.eventId}`).expect(200);

    expect(response.body).toMatchObject({ eventId: envelope.eventId, type: 'SondeoEmitido' });
  });

  it('answers 400 to a malformed push and 404 to an unknown id', async () => {
    await request(app.getHttpServer()).post('/events/pubsub').send({}).expect(400);
    await request(app.getHttpServer()).get('/events/processed/nope').expect(404);
  });

  it('exposes only the publisher when no inbox is configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MessagingModule.forRoot({ service: 'gateway' })],
    }).compile();
    const publisherOnly = moduleRef.createNestApplication();
    await publisherOnly.init();

    expect(publisherOnly.get(EventPublisher)).toBeInstanceOf(EventPublisher);
    await request(publisherOnly.getHttpServer()).post('/events/pubsub').send({}).expect(404);
    await publisherOnly.close();
  });
});

describe('MessagingModule outside the emulator', () => {
  it('rejects pushes without a Pub/Sub identity token', async () => {
    const emulatorHost = process.env.PUBSUB_EMULATOR_HOST;
    delete process.env.PUBSUB_EMULATOR_HOST;
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({
          service: 'flota',
          inbox: { useFactory: () => new InMemoryInboxStore() },
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/events/pubsub').send({}).expect(401);
    await request(app.getHttpServer())
      .post('/events/pubsub')
      .set('Authorization', 'Basic abc')
      .send({})
      .expect(401);

    await app.close();
    process.env.PUBSUB_EMULATOR_HOST = emulatorHost;
  });
});
