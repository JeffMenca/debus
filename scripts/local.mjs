#!/usr/bin/env node
// Brings up the whole stack on this machine in one step: env files, docker compose, Pub/Sub topics and
// subscriptions, database migrations and every app in watch mode (web :3000, gateway :4000, services :4001-4007).
// Usage: node scripts/local.mjs [--setup-only]
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const setupOnly = process.argv.includes('--setup-only');

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const { status } = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (status !== 0) {
    console.error(`\n${label} failed (exit ${status}).`);
    process.exit(status ?? 1);
  }
}

function copyMissingEnvFiles() {
  const dirs = [
    'apps/web',
    ...readdirSync(join(root, 'services')).map((name) => `services/${name}`),
  ];
  for (const dir of dirs) {
    const example = join(root, dir, '.env.example');
    const target = join(root, dir, '.env');
    if (existsSync(example) && !existsSync(target)) {
      copyFileSync(example, target);
      console.log(`created ${dir}/.env from .env.example`);
    }
  }
}

// The emulator has no healthcheck: compose reports it running before it accepts connections.
async function waitForPubSubEmulator() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await fetch('http://localhost:8085');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.error('The Pub/Sub emulator did not answer on localhost:8085 within 60 s.');
  process.exit(1);
}

// Cloud Scheduler flushes every outbox each minute in GCP; locally this does it every 30 s. Without
// it, events written inside a handler (such as the email of a driver's account) would never leave.
async function startOutboxFlusher() {
  const { BACKEND_SERVICES, LOCAL_PORTS } = await import('@debus/contracts');
  setInterval(() => {
    for (const service of BACKEND_SERVICES) {
      fetch(`http://localhost:${LOCAL_PORTS[service]}/outbox/flush`, { method: 'POST' }).catch(
        () => undefined,
      );
    }
  }, 30_000);
}

copyMissingEnvFiles();
run('Starting PostgreSQL, the Pub/Sub emulator, the media bucket and Mailpit', 'docker', [
  'compose',
  'up',
  '-d',
  '--wait',
]);
await waitForPubSubEmulator();
run('Creating Pub/Sub topics and subscriptions', 'pnpm', ['pubsub:provision']);
run('Applying database migrations', 'pnpm', [
  '--filter',
  './services/*',
  '--if-present',
  'run',
  'prisma:deploy',
]);

if (setupOnly) {
  console.log('\nLocal stack ready. Start the apps with: pnpm dev');
} else {
  console.log(
    '\nWeb http://localhost:3000 · API http://localhost:4000 · Mailpit http://localhost:8025\n',
  );
  await startOutboxFlusher();
  console.log('\n> Starting web, gateway and services');
  const dev = spawn('pnpm', ['dev'], { cwd: root, stdio: 'inherit' });
  dev.on('exit', (code) => process.exit(code ?? 1));
}
