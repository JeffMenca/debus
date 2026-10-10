import { SqlInboxStore } from '../src/inbox/sql-inbox-store';
import { testPool, transactional } from './support/pg';

describe('SqlInboxStore against PostgreSQL', () => {
  const pool = testPool('messaging_test');
  const store = new SqlInboxStore(transactional(pool));

  beforeAll(async () => {
    await pool.query('CREATE SCHEMA IF NOT EXISTS messaging_test');
    await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query('CREATE TABLE IF NOT EXISTS handler_notes (note TEXT NOT NULL)');
    await pool.query('TRUNCATE processed_events, handler_notes');
  });

  afterAll(() => pool.end());

  it('processes an event once and finds it afterwards', async () => {
    const work = jest.fn().mockResolvedValue(undefined);

    expect(await store.runOnce({ eventId: 'a', type: 'ProbeSent' }, work)).toBe('processed');
    expect(await store.runOnce({ eventId: 'a', type: 'ProbeSent' }, work)).toBe('duplicate');
    expect(work).toHaveBeenCalledTimes(1);
    expect(await store.findProcessed('a')).toMatchObject({ eventId: 'a', type: 'ProbeSent' });
  });

  it('rolls the mark back when the handler fails so a retry can process it', async () => {
    const event = { eventId: 'b', type: 'ProbeSent' };

    await expect(store.runOnce(event, () => Promise.reject(new Error('boom')))).rejects.toThrow();
    expect(await store.findProcessed('b')).toBeNull();
    expect(await store.runOnce(event, () => Promise.resolve())).toBe('processed');
  });

  it('runs the handler exactly once for concurrent duplicate deliveries', async () => {
    const work = jest.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    const event = { eventId: 'c', type: 'ProbeSent' };

    const outcomes = await Promise.all(Array.from({ length: 5 }, () => store.runOnce(event, work)));

    expect(work).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((outcome) => outcome === 'processed')).toHaveLength(1);
  });

  it('lets the handler write through the same transaction as the mark', async () => {
    const failing = { eventId: 'd', type: 'ProbeSent' };
    const passing = { eventId: 'e', type: 'ProbeSent' };

    await expect(
      store.runOnce(failing, async (tx) => {
        await tx?.$executeRawUnsafe('INSERT INTO handler_notes (note) VALUES ($1)', 'rolled back');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await store.runOnce(passing, async (tx) => {
      await tx?.$executeRawUnsafe('INSERT INTO handler_notes (note) VALUES ($1)', 'kept');
    });

    const { rows } = await pool.query('SELECT note FROM handler_notes');
    expect(rows).toEqual([{ note: 'kept' }]);
  });
});
