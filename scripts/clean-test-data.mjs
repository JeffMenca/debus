#!/usr/bin/env node
// Removes what tests leave in the local databases: accounts under the test email domain, the
// settings versions they wrote (and orphaned ones, whose author was already removed), their emails,
// the test branches that no other account belongs to, and the copies of settings versions that no
// longer exist in administracion. Event bookkeeping is not test data: see prune-local-events.mjs.
// psql runs inside the docker compose Postgres, so this can only ever touch the local stack.
// The SQL lives in @debus/config/test-data-sql, where integration tests run it too.
// Usage: node scripts/clean-test-data.mjs [--run <id>]
//   --run limits the cleanup to what one test run created (the TEST_RUN of @debus/config/test-data).
import { createRequire } from 'node:module';
import { localDatabases } from './lib/local-databases.mjs';

const { cleanupStatements, keptBranchesQuery } = createRequire(import.meta.url)(
  '../packages/config/test-data-sql.cjs',
);

const args = process.argv.slice(2);
const runFlag = args.indexOf('--run');
const run = runFlag === -1 ? null : (args[runFlag + 1] ?? '');
if (run !== null && !/^[0-9a-f]{8}$/.test(run)) {
  console.error('--run expects the 8 hex characters of a TEST_RUN.');
  process.exit(1);
}

const SOURCE_OF_SETTINGS = 'administracion';
const lines = (output) => output.split('\n').filter(Boolean);

function clean({ name, run: sql }, settingsVersionIds) {
  sql(cleanupStatements({ run, settingsVersionIds }).join('\n'));
  console.log(`test data removed from ${name}`);
  if (sql("SELECT to_regclass('public.branches') IS NOT NULL").trim() !== 't') return;
  for (const branch of lines(sql(keptBranchesQuery(run)))) {
    console.warn(
      `kept branch "${branch}" in ${name}: accounts that are not test data belong to it`,
    );
  }
}

const databases = localDatabases() ?? [];
// The source goes first: the copies elsewhere keep only the versions it still has afterwards.
const source = databases.find(({ name }) => name === SOURCE_OF_SETTINGS);
let settingsVersionIds = null;
if (source) {
  clean(source, null);
  settingsVersionIds = lines(source.run('SELECT id FROM settings_versions ORDER BY id'));
}
for (const database of databases) {
  if (database !== source) clean(database, settingsVersionIds);
}
