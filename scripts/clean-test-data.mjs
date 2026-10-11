#!/usr/bin/env node
// Removes what tests leave in the local databases: accounts under the test email domain, test
// branches, their emails, and idempotency and outbox rows older than an hour. psql runs inside the
// docker compose Postgres, so this can only ever touch the local stack.
// Usage: node scripts/clean-test-data.mjs
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { TEST_EMAIL_DOMAIN, TEST_BRANCH_PREFIX } = createRequire(import.meta.url)(
  '../packages/config/test-data.cjs',
);
const user = process.env.POSTGRES_USER ?? 'debus';
const testEmails = `'%@${TEST_EMAIL_DOMAIN}'`;
const testBranches = `'${TEST_BRANCH_PREFIX}%'`;
const testUsers = `SELECT id FROM users WHERE email LIKE ${testEmails}`;

// Every database runs every statement whose table exists, so new services are covered as they grow.
const STATEMENTS = [
  ['refresh_tokens', `DELETE FROM refresh_tokens WHERE user_id IN (${testUsers})`],
  ['account_links', `DELETE FROM account_links WHERE user_id IN (${testUsers})`],
  ['users', `DELETE FROM users WHERE email LIKE ${testEmails}`],
  ['sent_emails', `DELETE FROM sent_emails WHERE recipient LIKE ${testEmails}`],
  ['branches', `DELETE FROM branches WHERE name LIKE ${testBranches}`],
  [
    'processed_events',
    `DELETE FROM processed_events WHERE processed_at < now() - interval '1 hour'`,
  ],
  ['outbox', `DELETE FROM outbox WHERE published_at < now() - interval '1 hour'`],
];

const guarded = STATEMENTS.map(
  ([table, sql]) =>
    `DO $$ BEGIN IF to_regclass('public.${table}') IS NOT NULL THEN ${sql}; END IF; END $$;`,
).join('\n');

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
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

let running = '';
try {
  running = execFileSync('docker', ['compose', 'ps', '-q', 'postgres'], {
    encoding: 'utf8',
  }).trim();
} catch {
  // Docker is not available (CI uses throwaway databases).
}
if (!running) {
  console.log('Local Postgres is not running; nothing to clean.');
  process.exit(0);
}

const databases = psql(
  'postgres',
  "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'",
)
  .split('\n')
  .filter(Boolean);
for (const database of databases) {
  psql(database, guarded);
  console.log(`test data removed from ${database}`);
}
