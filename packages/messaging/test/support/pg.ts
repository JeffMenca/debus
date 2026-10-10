import { Pool, type PoolClient } from 'pg';
import type { SqlClient, SqlTransactional } from '../../src/inbox/sql-inbox-store';
import { OUTBOX_TABLE_SQL } from '../../src/outbox/sql-outbox-store';

// Each test file passes its own schema, so files running in parallel never share tables.
export function testPool(schema: string): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
}

export async function recreateOutboxTable(pool: Pool, schema: string): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query('DROP TABLE IF EXISTS outbox');
  await pool.query(OUTBOX_TABLE_SQL);
}

// Adapts node-postgres to the PrismaClient subset the stores rely on.
export function sqlClient(runner: Pool | PoolClient): SqlClient {
  return {
    $executeRawUnsafe: (query, ...values) =>
      runner.query(query, values).then((result) => result.rowCount ?? 0),
    $queryRawUnsafe: <T>(query: string, ...values: unknown[]) =>
      runner.query(query, values).then((result) => result.rows as T),
  };
}

export function transactional(pool: Pool): SqlTransactional {
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
