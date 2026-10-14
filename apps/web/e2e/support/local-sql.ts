import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const USER = process.env.POSTGRES_USER ?? 'debus';

// Reads from a database of the docker compose Postgres. psql runs inside the container, so it can
// only ever reach the local stack; specs use it to see what the services stored, never to write.
export function queryLocal(database: string, sql: string): string[] {
  const output = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', USER, '-qAt', '-d', database, '-c', sql],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output.split('\n').filter(Boolean);
}
