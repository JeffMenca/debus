#!/usr/bin/env node
// Runs the unit or integration suites of every workspace and prints one coverage table at the end.
// Integration runs always end by removing the test data from the local databases.
// Usage: node scripts/test-coverage.mjs unit|integration [extra turbo args, e.g. --filter=@debus/flota]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUITES = {
  unit: { task: 'test', dir: 'coverage', threshold: 85 },
  integration: { task: 'test:integration', dir: 'coverage-integration', threshold: 65 },
};
const METRICS = ['statements', 'branches', 'functions', 'lines'];

const root = new URL('..', import.meta.url).pathname;
const [kind, ...turboArgs] = process.argv.slice(2);
const suite = SUITES[kind];
if (!suite) {
  console.error('Usage: node scripts/test-coverage.mjs unit|integration [turbo args]');
  process.exit(1);
}

const workspaces = ['apps', 'packages', 'services'].flatMap((group) =>
  readdirSync(join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${group}/${entry.name}`),
);
const startedAt = Date.now();

const { status } = spawnSync(
  'pnpm',
  ['turbo', 'run', suite.task, '--output-logs=errors-only', ...turboArgs],
  { cwd: root, stdio: 'inherit' },
);
if (kind === 'integration') {
  spawnSync('node', ['scripts/clean-test-data.mjs'], { cwd: root, stdio: 'inherit' });
}

function summaryOf(workspace) {
  const file = join(root, workspace, suite.dir, 'coverage-summary.json');
  if (!existsSync(file)) return null;
  // turbo restores cached coverage too, so a cache hit still reports the last real run.
  return JSON.parse(readFileSync(file, 'utf8')).total;
}

const rows = workspaces
  .map((workspace) => ({ workspace, total: summaryOf(workspace) }))
  .filter((row) => row.total);
const pad = (value, width) => String(value).padEnd(width);
const width = Math.max(...rows.map((row) => row.workspace.length), 9) + 2;

console.log(`\n${kind} coverage (minimum ${suite.threshold}%)\n`);
console.log(pad('Workspace', width) + METRICS.map((metric) => pad(metric, 12)).join(''));
for (const { workspace, total } of rows) {
  const cells = METRICS.map((metric) => {
    const pct = total[metric].pct;
    return pad(`${pct.toFixed(1)}${pct < suite.threshold ? ' !' : ''}`, 12);
  });
  console.log(pad(workspace, width) + cells.join(''));
}
console.log(
  `\n${status === 0 ? 'PASSED' : 'FAILED'} in ${Math.round((Date.now() - startedAt) / 1000)} s`,
);
console.log(`HTML report per workspace: <workspace>/${suite.dir}/lcov-report/index.html`);
process.exit(status ?? 1);
