import { createEnvelope, type EventEnvelope } from '@debus/contracts';
import { Outbox } from '../src/outbox/outbox';
import { SqlOutboxStore } from '../src/outbox/sql-outbox-store';
import type { EventPublisher } from '../src/publishing/event-publisher';
import { recreateOutboxTable, sqlClient, testPool, transactional } from './support/pg';

const SCHEMA = 'messaging_test_outbox';
const newEvent = (correlationId = 'c') =>
  createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, correlationId);
const ids = (events: { eventId: string }[]) => events.map((event) => event.eventId);

describe('SqlOutboxStore against PostgreSQL', () => {
  const pool = testPool(SCHEMA);
  const db = transactional(pool);
  const store = new SqlOutboxStore(db);
  const enqueue = (envelope: EventEnvelope) => db.$transaction((tx) => store.enqueue(tx, envelope));
  const row = async (eventId: string) =>
    (
      await pool.query<{
        attempts: number;
        last_error: string | null;
        published: boolean;
        claimed: boolean;
      }>(
        `SELECT attempts, last_error, published_at IS NOT NULL AS published, claimed_until IS NOT NULL AS claimed
         FROM outbox WHERE event_id = $1`,
        [eventId],
      )
    ).rows[0];

  beforeAll(() => recreateOutboxTable(pool, SCHEMA));

  beforeEach(() => pool.query('TRUNCATE outbox'));

  afterAll(() => pool.end());

  it('only claims events whose transaction committed', async () => {
    const committed = newEvent();
    const rolledBack = newEvent();
    await enqueue(committed);
    await expect(
      db.$transaction(async (tx) => {
        await store.enqueue(tx, rolledBack);
        throw new Error('business rule failed');
      }),
    ).rejects.toThrow();

    const claimed = await store.claim(100, 60_000);

    expect(ids(claimed)).toEqual([committed.eventId]);
  });

  it('hands the stored envelope back unchanged, oldest first', async () => {
    const first = newEvent('c-first');
    const second = newEvent('c-second');
    await enqueue(first);
    await enqueue(second);

    const claimed = await store.claim(100, 60_000);

    expect(claimed.map((event) => event.envelope)).toEqual([first, second]);
  });

  it('does not hand out an event while its lease is alive and does once it expires', async () => {
    const event = newEvent();
    await enqueue(event);

    // A lease far longer than a slow CI step, so the second claim always lands inside it.
    expect(ids(await store.claim(100, 1500))).toEqual([event.eventId]);
    expect(await store.claim(100, 1500)).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(ids(await store.claim(100, 1500))).toEqual([event.eventId]);
  });

  // The first claim stays uncommitted, so the second one really overlaps with it.
  it('never hands out events that another claim holds locked', async () => {
    for (let i = 0; i < 20; i += 1) await enqueue(newEvent(`c${i}`));
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      const held = await new SqlOutboxStore(sqlClient(holder)).claim(100, 60_000);
      expect(held).toHaveLength(20);
      const blocked = Symbol('blocked');
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<symbol>((resolve) => {
        timer = setTimeout(() => resolve(blocked), 1500);
      });

      const second = store.claim(100, 60_000);
      const outcome = await Promise.race([second, timeout]);
      clearTimeout(timer);
      await holder.query('COMMIT');

      expect(outcome).toEqual([]);
      await second;
    } finally {
      holder.release();
    }
  });

  it('keeps a failed event pending, counts the attempt and lets the next claim take it', async () => {
    const event = newEvent();
    await enqueue(event);
    await store.claim(100, 60_000);

    await store.markFailed(event.eventId, 'down');

    expect(await row(event.eventId)).toEqual({
      attempts: 1,
      last_error: 'down',
      published: false,
      claimed: false,
    });
    expect(ids(await store.claim(100, 60_000))).toEqual([event.eventId]);
  });

  it('never offers a published event again', async () => {
    const event = newEvent();
    await enqueue(event);
    await store.claim(100, 150);

    await store.markPublished(event.eventId);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(await store.claim(100, 60_000)).toEqual([]);
    expect(await row(event.eventId)).toMatchObject({ published: true, claimed: false });
  });

  it('drops the payload once the event is published, keeping the envelope metadata', async () => {
    const event = newEvent('trace-1');
    await enqueue(event);
    await store.claim(100, 60_000);

    await store.markPublished(event.eventId);

    const { rows } = await pool.query<{ envelope: Record<string, unknown> }>(
      'SELECT envelope FROM outbox WHERE event_id = $1',
      [event.eventId],
    );
    expect(rows[0]?.envelope).toEqual({
      eventId: event.eventId,
      type: event.type,
      version: event.version,
      occurredAt: event.occurredAt,
      correlationId: 'trace-1',
    });
  });

  it('keeps the payload of an event that failed so it can be published later', async () => {
    const event = newEvent();
    await enqueue(event);
    await store.claim(100, 60_000);

    await store.markFailed(event.eventId, 'unavailable');

    expect(ids(await store.claim(100, 60_000))).toEqual([event.eventId]);
    const { rows } = await pool.query<{ envelope: EventEnvelope }>(
      'SELECT envelope FROM outbox WHERE event_id = $1',
      [event.eventId],
    );
    expect(rows[0]?.envelope.payload).toEqual(event.payload);
  });

  it('releases events that were claimed but not attempted', async () => {
    const [a, b] = [newEvent(), newEvent()];
    await enqueue(a);
    await enqueue(b);
    await store.claim(100, 60_000);

    await store.release([a.eventId, b.eventId]);

    expect(ids(await store.claim(100, 60_000))).toEqual([a.eventId, b.eventId]);
  });
});

describe('Outbox against PostgreSQL', () => {
  const pool = testPool(`${SCHEMA}_flush`);
  const db = transactional(pool);
  const store = new SqlOutboxStore(db);
  const publisher = { publish: jest.fn() };
  const outbox = new Outbox(store, publisher as unknown as EventPublisher);

  beforeAll(() => recreateOutboxTable(pool, `${SCHEMA}_flush`));

  beforeEach(async () => {
    publisher.publish.mockReset();
    await pool.query('TRUNCATE outbox');
  });

  afterAll(() => pool.end());

  it('returns within its budget when a publication never resolves and retries it later', async () => {
    const event = await db.$transaction((tx) =>
      outbox.add(tx, 'ProbeSent', { requestedAt: new Date().toISOString() }, 'hung'),
    );
    publisher.publish.mockReturnValue(new Promise(() => undefined));
    const startedAt = Date.now();

    const result = await outbox.flush({ budgetMs: 200 });

    expect(Date.now() - startedAt).toBeLessThan(1500);
    expect(result).toEqual({ published: 0, failed: 1 });
    const { rows } = await pool.query(
      'SELECT attempts, last_error FROM outbox WHERE event_id = $1',
      [event.eventId],
    );
    expect(rows[0]).toMatchObject({ attempts: 1 });
    publisher.publish.mockResolvedValue('id');
    expect(await outbox.flush()).toEqual({ published: 1, failed: 0 });
  });
});
