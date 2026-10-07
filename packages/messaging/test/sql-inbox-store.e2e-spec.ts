import { Pool, type PoolClient } from 'pg';
import { SqlInboxStore, type SqlClient, type SqlTransactional } from '../src/inbox/sql-inbox-store';

// Adapts node-postgres to the PrismaClient subset the store relies on.
function sqlClient(runner: Pool | PoolClient): SqlClient {
  return {
    $executeRawUnsafe: (query, ...values) =>
      runner.query(query, values).then((result) => result.rowCount ?? 0),
    $queryRawUnsafe: <T>(query: string, ...values: unknown[]) =>
      runner.query(query, values).then((result) => result.rows as T),
  };
}

function transactional(pool: Pool): SqlTransactional {
  return {
    ...sqlClient(pool),
    async $transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(sqlClient(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

describe('SqlInboxStore against PostgreSQL', () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: '-c search_path=messaging_test',
  });
  const store = new SqlInboxStore(transactional(pool));

  beforeAll(async () => {
    await pool.query('CREATE SCHEMA IF NOT EXISTS messaging_test');
    await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query('TRUNCATE processed_events');
  });

  afterAll(() => pool.end());

  it('processes an event once and finds it afterwards', async () => {
    const work = jest.fn().mockResolvedValue(undefined);

    expect(await store.runOnce({ eventId: 'a', type: 'SondeoEmitido' }, work)).toBe('processed');
    expect(await store.runOnce({ eventId: 'a', type: 'SondeoEmitido' }, work)).toBe('duplicate');
    expect(work).toHaveBeenCalledTimes(1);
    expect(await store.findProcessed('a')).toMatchObject({ eventId: 'a', type: 'SondeoEmitido' });
  });

  it('rolls the mark back when the handler fails so a retry can process it', async () => {
    const event = { eventId: 'b', type: 'SondeoEmitido' };

    await expect(store.runOnce(event, () => Promise.reject(new Error('boom')))).rejects.toThrow();
    expect(await store.findProcessed('b')).toBeNull();
    expect(await store.runOnce(event, () => Promise.resolve())).toBe('processed');
  });

  it('runs the handler exactly once for concurrent duplicate deliveries', async () => {
    const work = jest.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    const event = { eventId: 'c', type: 'SondeoEmitido' };

    const outcomes = await Promise.all(Array.from({ length: 5 }, () => store.runOnce(event, work)));

    expect(work).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((outcome) => outcome === 'processed')).toHaveLength(1);
  });
});
