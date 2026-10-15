import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { createEnvelope, type EventEnvelope } from '@debus/contracts';
import { EventPublisher, Outbox } from '@debus/messaging';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { type IsolatedSchema, isolatedSchema } from './support/isolated-schema';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

// Both groups work on a schema of their own: a flush claims every pending row of the outbox it
// sees, so on the shared schema it would also take (and mark as published) the rows that the local
// stack has not sent yet, and the stack would take the rows of the test.
let isolated: IsolatedSchema;

beforeAll(async () => {
  isolated = await isolatedSchema('events');
});

afterAll(async () => {
  await isolated.drop();
});

async function createApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(isolated.client);
  const app = (await customize(builder).compile()).createNestApplication();
  await app.init();
  return app;
}

const currentSchemaOf = async (prisma: PrismaService): Promise<string | undefined> => {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>('SELECT current_schema() AS name');
  return rows[0]?.name;
};

describe('Pub/Sub push endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs on a schema of its own', async () => {
    expect(await currentSchemaOf(app.get(PrismaService))).toBe(isolated.schema);
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
    app = await createApp((builder) =>
      builder.overrideProvider(EventPublisher).useValue(publisher),
    );
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs on a schema of its own', async () => {
    expect(await currentSchemaOf(prisma)).toBe(isolated.schema);
  });

  // Publishing takes longer than Prisma's interactive transaction timeout (5 s) in total.
  it('marks every event correctly when publishing is slow', async () => {
    const outbox = app.get(Outbox);
    const added = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const correlationId of ['first', 'second', 'rejected']) {
        ids.push(
          (
            await outbox.add(
              tx,
              'ProbeSent',
              { requestedAt: new Date().toISOString() },
              correlationId,
            )
          ).eventId,
        );
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
        await outbox.add(tx, 'ProbeSent', { requestedAt: new Date().toISOString() }, correlationId);
      }
    });

    const result = await outbox.flush({ budgetMs: 250 });

    expect(result).toEqual({ published: 0, failed: 1 });
    const rows = await prisma.outboxEvent.findMany();
    expect(rows.filter((row) => row.attempts === 1)).toHaveLength(1);
    expect(rows.filter((row) => row.attempts === 0 && row.claimedUntil === null)).toHaveLength(2);
  });
});
