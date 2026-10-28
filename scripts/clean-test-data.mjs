#!/usr/bin/env node
// Removes what tests leave in the local databases: accounts under the test email domain, the
// settings versions they wrote (and orphaned ones, whose author was already removed), their emails,
// the test branches that no other account belongs to, the copies of settings versions that no
// longer exist in administracion and the report rows of branches that no longer exist there either.
// Event bookkeeping is not test data: see prune-local-events.mjs.
// psql runs inside the docker compose Postgres, so this can only ever touch the local stack.
// The SQL lives in @debus/config/test-data-sql, where integration tests run it too.
// Usage: node scripts/clean-test-data.mjs [--run <id>]
//   --run limits the cleanup to what one test run created (the TEST_RUN of @debus/config/test-data).
//   Without it, throwaway schemas (test_run_*) are dropped only when stale, so a run in progress keeps its own.
//   Test accounts and branches have no such guard: never run it without --run while tests are running.
import { createRequire } from 'node:module';
import { localDatabases } from './lib/local-databases.mjs';

const { cleanupStatements, keptBranchesQuery, photoKeysQuery } = createRequire(import.meta.url)(
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
// The local media bucket (fake-gcs-server in docker compose); the same address flota uses in local.
const MEDIA_API = `${process.env.MEDIA_EMULATOR_URL ?? 'http://localhost:4443'}/storage/v1/b/${process.env.MEDIA_BUCKET ?? 'debus-media-local'}/o`;

// Photos are not in the database: their keys are read before the rows are deleted.
async function removePhotos(sql) {
  for (const key of lines(sql(photoKeysQuery(run)))) {
    const response = await fetch(`${MEDIA_API}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }).catch(() => null);
    if (!response || (!response.ok && response.status !== 404)) {
      console.warn(`could not remove the photo ${key} from the local bucket`);
    }
  }
}

async function clean({ name, run: sql }, { settingsVersionIds, branchIds }) {
  if (sql("SELECT to_regclass('public.buses') IS NOT NULL").trim() === 't') await removePhotos(sql);
  sql(cleanupStatements({ run, settingsVersionIds, branchIds }).join('\n'));
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
// Without the source there is nothing to compare against, and nothing that depends on it is removed.
let kept = { settingsVersionIds: null, branchIds: null };
if (source) {
  await clean(source, kept);
  kept = {
    settingsVersionIds: lines(source.run('SELECT id FROM settings_versions ORDER BY id')),
    branchIds: lines(source.run('SELECT id FROM branches ORDER BY id')),
  };
}
for (const database of databases) {
  if (database !== source) await clean(database, kept);
}
