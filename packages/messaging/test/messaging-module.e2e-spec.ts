import 'reflect-metadata';
import { createEnvelope, eventEnvelopeSchema, exampleBus } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  EventPublisher,
  InMemoryInboxStore,
  MessagingModule,
  OIDC_VERIFIER,
  Outbox,
  pushBody,
} from '../src';
import { recreateOutboxTable, testPool, transactional } from './support/pg';
import { pullOne } from './support/pull';

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
    const envelope = createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, 'c');
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(pushBody(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(pushBody(envelope)).expect(204);
    const response = await request(server).get(`/events/processed/${envelope.eventId}`).expect(200);

    expect(response.body).toMatchObject({ eventId: envelope.eventId, type: 'ProbeSent' });
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

  describe('with a configured push identity', () => {
    const pushServiceAccount = 'pubsub-invoker@debus.iam.gserviceaccount.com';
    const saved = { ...process.env };
    const payloads: Record<string, { email?: string; email_verified?: boolean }> = {
      valid: { email: pushServiceAccount, email_verified: true },
      unverified: { email: pushServiceAccount, email_verified: false },
      foreign: { email: 'someone@else.com', email_verified: true },
    };
    let app: INestApplication;

    beforeAll(async () => {
      delete process.env.PUBSUB_EMULATOR_HOST;
      process.env.PUBSUB_AUDIENCE = 'https://flota.example.com';
      process.env.PUBSUB_PUSH_SA = pushServiceAccount;
      const moduleRef = await Test.createTestingModule({
        imports: [
          MessagingModule.forRoot({
            service: 'flota',
            inbox: { useFactory: () => new InMemoryInboxStore() },
          }),
        ],
      })
        .overrideProvider(OIDC_VERIFIER)
        .useValue({
          verifyIdToken: async ({ idToken }: { idToken: string }) => {
            const payload = payloads[idToken];
            if (!payload) throw new Error('invalid token');
            return { getPayload: () => payload };
          },
        })
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      process.env = saved;
    });

    it('accepts a push signed by the push service account', async () => {
      const envelope = createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, 'c');

      await request(app.getHttpServer())
        .post('/events/pubsub')
        .set('Authorization', 'Bearer valid')
        .send(pushBody(envelope))
        .expect(204);
    });

    it.each(['unverified', 'foreign', 'forged'])('rejects a %s token', async (token) => {
      await request(app.getHttpServer())
        .post('/events/pubsub')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(401);
    });
  });
});

describe('MessagingModule outbox', () => {
  const pool = testPool('messaging_test_module');
  const db = transactional(pool);
  const pubsub = new PubSub({ projectId: process.env.PUBSUB_PROJECT_ID });
  const subscriptionName = `outbox-test-${Date.now()}`;
  let app: INestApplication;

  beforeAll(async () => {
    await recreateOutboxTable(pool, 'messaging_test_module');
    const [exists] = await pubsub.topic('flota-events').exists();
    if (!exists) await pubsub.createTopic('flota-events');
    await pubsub.topic('flota-events').createSubscription(subscriptionName);
    const moduleRef = await Test.createTestingModule({
      imports: [MessagingModule.forRoot({ service: 'flota', outbox: { useFactory: () => db } })],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pubsub.subscription(subscriptionName).delete();
    await pubsub.close();
    await pool.end();
  });

  it('publishes an event added in a transaction when the flush endpoint is called', async () => {
    const envelope = await db.$transaction((tx) =>
      app.get(Outbox).add(tx, 'BusAdded', exampleBus, 'c-outbox'),
    );

    const response = await request(app.getHttpServer()).post('/outbox/flush').expect(200);

    expect(response.body).toEqual({ published: 1, failed: 0 });
    const message = await pullOne(subscriptionName);
    expect(eventEnvelopeSchema.parse(JSON.parse(message.data))).toEqual(envelope);
  });

  it('keeps an event the service may not publish pending and counts the attempt', async () => {
    await pool.query('TRUNCATE outbox');
    const envelope = await db.$transaction((tx) =>
      app.get(Outbox).add(tx, 'ProbeSent', { requestedAt: new Date().toISOString() }),
    );

    const response = await request(app.getHttpServer()).post('/outbox/flush').expect(200);

    expect(response.body).toEqual({ published: 0, failed: 1 });
    const { rows } = await pool.query<{ attempts: number; last_error: string }>(
      'SELECT attempts, last_error FROM outbox WHERE event_id = $1',
      [envelope.eventId],
    );
    expect(rows[0]).toEqual({
      attempts: 1,
      last_error: 'flota cannot publish ProbeSent',
    });
  });

  it('answers 200 with an empty result when the database is down', async () => {
    const failingDb = {
      $executeRawUnsafe: () => Promise.reject(new Error('down')),
      $queryRawUnsafe: () => Promise.reject(new Error('down')),
      $transaction: () => Promise.reject(new Error('down')),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({ service: 'flota', outbox: { useFactory: () => failingDb } }),
      ],
    }).compile();
    const failing = moduleRef.createNestApplication();
    await failing.init();

    const response = await request(failing.getHttpServer()).post('/outbox/flush').expect(200);

    expect(response.body).toEqual({ published: 0, failed: 0 });
    await failing.close();
  });

  it('does not expose the inbound endpoints when only the outbox is configured', async () => {
    await request(app.getHttpServer()).post('/events/pubsub').send({}).expect(404);
  });
});

describe('MessagingModule outbox outside the emulator', () => {
  it('rejects a flush without an identity token', async () => {
    const emulatorHost = process.env.PUBSUB_EMULATOR_HOST;
    delete process.env.PUBSUB_EMULATOR_HOST;
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({
          service: 'flota',
          outbox: { useFactory: () => ({}) as never },
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/outbox/flush').expect(401);

    await app.close();
    process.env.PUBSUB_EMULATOR_HOST = emulatorHost;
  });
});
