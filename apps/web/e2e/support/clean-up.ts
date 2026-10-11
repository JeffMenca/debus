import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { TEST_RUN } from '@debus/config/test-data';

const CLEAN_SCRIPT = path.resolve(__dirname, '../../../../scripts/clean-test-data.mjs');

// Specs that run against the real stack create accounts and branches through the pages. This removes
// what this worker's run created (TEST_RUN) from the local databases, and nothing else, so workers
// running at the same time do not clean each other.
export function cleanUpTestRun(): void {
  execFileSync(process.execPath, [CLEAN_SCRIPT, '--run', TEST_RUN], { stdio: 'inherit' });
}
