#!/usr/bin/env node
// Prunes event bookkeeping older than an hour from the local databases: handled inbox entries
// (processed_events) and published outbox rows. This is housekeeping for a local stack, not test
// data, so pnpm test:clean leaves it alone; pruning inbox entries forgets which events were handled.
// Usage: node scripts/prune-local-events.mjs
import { createRequire } from 'node:module';
import { localDatabases } from './lib/local-databases.mjs';

const { whenTablesExist } = createRequire(import.meta.url)('../packages/config/test-data-sql.cjs');

const STATEMENTS = [
  whenTablesExist(
    ['processed_events'],
    `DELETE FROM processed_events WHERE processed_at < now() - interval '1 hour'`,
  ),
  whenTablesExist(['outbox'], `DELETE FROM outbox WHERE published_at < now() - interval '1 hour'`),
].join('\n');

for (const database of localDatabases() ?? []) {
  database.run(STATEMENTS);
  console.log(`old events pruned from ${database.name}`);
}
