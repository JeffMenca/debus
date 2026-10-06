#!/usr/bin/env node
// Prints a JSON array of deployable units (services/* and web) affected since TURBO_SCM_BASE, for CI matrices.
import { execFileSync } from 'node:child_process';

const output = execFileSync('pnpm', ['turbo', 'ls', '--affected', '--output=json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const json = JSON.parse(output.slice(output.indexOf('{')));
const deployables = json.packages.items
  .filter(({ path }) => path.startsWith('services/') || path === 'apps/web')
  .map(({ path }) => path.split('/').pop());

process.stdout.write(JSON.stringify(deployables));
