// Runs SQL in the databases of the docker compose Postgres. psql runs inside the container, so
// this can only ever touch the local stack.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// docker compose finds its file from the working directory, so it always runs at the repository root.
const cwd = fileURLToPath(new URL('../..', import.meta.url));
const user = process.env.POSTGRES_USER ?? 'debus';
const PSQL = [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  user,
  '-qAt',
  '-v',
  'ON_ERROR_STOP=1',
];

const psql = (database, sql) =>
  execFileSync('docker', [...PSQL, '-d', database, '-c', sql], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

function isRunning() {
  try {
    return (
      execFileSync('docker', ['compose', 'ps', '-q', 'postgres'], {
        cwd,
        encoding: 'utf8',
      }).trim() !== ''
    );
  } catch {
    // Docker is not available (CI uses throwaway databases).
    return false;
  }
}

// The databases of the local Postgres as `{ name, run(sql) }`, or null when it is not running.
export function localDatabases() {
  if (!isRunning()) {
    console.log('Local Postgres is not running; nothing to do.');
    return null;
  }
  return psql(
    'postgres',
    "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'",
  )
    .split('\n')
    .filter(Boolean)
    .map((name) => ({ name, run: (sql) => psql(name, sql) }));
}
