import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const USER = process.env.POSTGRES_USER ?? 'debus';

function psql(database: string, sql: string): string[] {
  const output = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', USER, '-qAt', '-d', database, '-c', sql],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output.split('\n').filter(Boolean);
}

// Reads from a database of the docker compose Postgres. psql runs inside the container, so it can
// only ever reach the local stack; specs use it to see what the services stored.
export function queryLocal(database: string, sql: string): string[] {
  if (!/^\s*SELECT\b/i.test(sql))
    throw new Error('queryLocal only reads: the SQL must be a SELECT');
  return psql(database, sql);
}

// Deletes rows a spec itself created, to put the local stack in the state a scenario needs. Only
// for the rows of the spec's own test accounts, never for data it did not create.
export function deleteLocal(database: string, sql: string): string[] {
  if (!/^\s*DELETE FROM\b/i.test(sql))
    throw new Error('deleteLocal only deletes: the SQL must be a DELETE FROM');
  return psql(database, sql);
}
