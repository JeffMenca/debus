import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createEnvelope, type EventEnvelope } from '@debus/contracts';
import { EventPublisher, Outbox } from '@debus/messaging';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('Pub/Sub push endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('records a probe exactly once even when delivered twice', async () => {
    const envelope = createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, 'c');
    const server = app.getHttpServer();

    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);
    await request(server).post('/events/pubsub').send(push(envelope)).expect(204);

    const response = await request(server).get(`/events/processed/${envelope.eventId}`).expect(200);
    expect(response.body).toMatchObject({ eventId: envelope.eventId, type: 'ProbeSent' });
    const stored = await app
      .get(PrismaService)
      .processedEvent.count({ where: { eventId: envelope.eventId } });
    expect(stored).toBe(1);
  });

  it('flushes the outbox on demand', async () => {
    const response = await request(app.getHttpServer()).post('/outbox/flush').expect(200);

    expect(response.body).toEqual({ published: expect.any(Number), failed: 0 });
  });

  it('answers 404 for events it never received', async () => {
    await request(app.getHttpServer()).get('/events/processed/never').expect(404);
  });

  it('answers 400 to a malformed push', async () => {
    await request(app.getHttpServer()).post('/events/pubsub').send({ message: {} }).expect(400);
  });
});

describe('Outbox with the service database client', () => {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const published: string[] = [];
  let delayMs = 2500;
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    published.length = 0;
    delayMs = 2500;
    await prisma.outboxEvent.deleteMany();
  });

  beforeAll(async () => {
    const publisher = {
      publish: async (envelope: EventEnvelope) => {
        await pause(delayMs);
        if (envelope.correlationId === 'rejected') throw new Error('pubsub unavailable');
        published.push(envelope.eventId);
        return 'message-id';
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EventPublisher)
      .useValue(publisher)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany();
    await app.close();
  });

  // Publishing takes longer than Prisma's interactive transaction timeout (5 s) in total.
  it('marks every event correctly when publishing is slow', async () => {
    const outbox = app.get(Outbox);
    const added = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const correlationId of ['first', 'second', 'rejected']) {
        ids.push((await outbox.add(tx, 'ProbeSent', {}, correlationId)).eventId);
      }
      return ids;
    });

    const result = await outbox.flush();

    expect(result).toEqual({ published: 2, failed: 1 });
    expect([...published].sort()).toEqual(added.slice(0, 2).sort());
    const rows = await prisma.outboxEvent.findMany();
    const byCorrelation = (correlationId: string) =>
      rows.find(
        (row) => (row.envelope as { correlationId?: string }).correlationId === correlationId,
      );
    expect(byCorrelation('first')?.publishedAt).not.toBeNull();
    expect(byCorrelation('second')?.publishedAt).not.toBeNull();
    expect(byCorrelation('rejected')).toMatchObject({
      publishedAt: null,
      attempts: 1,
      lastError: 'pubsub unavailable',
    });
  }, 30000);

  it('releases the events it did not reach when the budget runs out', async () => {
    delayMs = 300;
    const outbox = app.get(Outbox);
    await prisma.$transaction(async (tx) => {
      for (const correlationId of ['first', 'second', 'third']) {
        await outbox.add(tx, 'ProbeSent', {}, correlationId);
      }
    });

    const result = await outbox.flush({ budgetMs: 250 });

    expect(result).toEqual({ published: 0, failed: 1 });
    const rows = await prisma.outboxEvent.findMany();
    expect(rows.filter((row) => row.attempts === 1)).toHaveLength(1);
    expect(rows.filter((row) => row.attempts === 0 && row.claimedUntil === null)).toHaveLength(2);
  });
});
