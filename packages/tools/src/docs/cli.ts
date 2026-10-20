#!/usr/bin/env node
import { syncManuals } from './manual';

const check = process.argv.includes('--check');
try {
  const changed = syncManuals(process.cwd(), { check });
  if (check && changed.length > 0) {
    console.error(`Out of date: ${changed.join(', ')}. Run pnpm run docs.`);
    process.exit(1);
  }
  console.log(changed.length > 0 ? `Updated ${changed.join(', ')}` : 'The manuals are up to date.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
