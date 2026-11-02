import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENV_FILE_TOKEN, schedulerArgs, type Step } from './release-plan';

export interface RunOptions {
  env?: Record<string, string>;
  stdinFrom?: string[];
  // Return the standard output instead of showing it.
  capture?: boolean;
}

export interface RunResult {
  code: number;
  stdout: string;
}

export interface StepDeps {
  run(argv: string[], options?: RunOptions): Promise<RunResult>;
  fetchStatus(url: string, headers: Record<string, string>): Promise<number>;
  sleep(ms: number): Promise<void>;
  now(): Date;
  log(line: string): void;
}

const HEALTH_ATTEMPTS = 5;
const HEALTH_DELAY_MS = 5_000;

// Variable names only: the values include the signing key and the mail password.
export function describeStep(step: Step): string {
  if (step.kind === 'health') return `${step.label}: GET ${step.url}${step.path}`;
  if (step.kind === 'seek') return `${step.label}: every subscription of ${step.project}, to now`;
  if (step.kind === 'scheduler') {
    return `${step.label}: ${step.job.schedule} POST ${step.url}${step.job.path}`;
  }
  const line = step.argv.join(' ');
  const piped = step.stdinFrom ? `${step.stdinFrom.join(' ')} | ` : '';
  const names = step.envVarsFile ? ` [variables: ${Object.keys(step.envVarsFile).join(', ')}]` : '';
  return `${step.label}: ${piped}${line}${names}`;
}

async function runChecked(deps: StepDeps, label: string, argv: string[], options?: RunOptions) {
  const result = await deps.run(argv, options);
  if (result.code !== 0) throw new Error(`${label} failed (exit ${result.code})`);
  return result;
}

async function runCommand(step: Extract<Step, { kind: 'command' }>, deps: StepDeps): Promise<void> {
  if (!step.envVarsFile) {
    await runChecked(deps, step.label, step.argv, { env: step.env, stdinFrom: step.stdinFrom });
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'debus-release-'));
  try {
    const file = join(dir, 'env.json');
    // JSON is valid YAML, which is what --env-vars-file reads, and quotes any value safely.
    writeFileSync(file, JSON.stringify(step.envVarsFile), { mode: 0o600 });
    const argv = step.argv.map((arg) => (arg === ENV_FILE_TOKEN ? file : arg));
    await runChecked(deps, step.label, argv, { env: step.env, stdinFrom: step.stdinFrom });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runScheduler(step: Extract<Step, { kind: 'scheduler' }>, deps: StepDeps) {
  const { job, url, settings } = step;
  const location = ['--location', settings.region];
  const exists = await deps.run(
    ['gcloud', 'scheduler', 'jobs', 'describe', job.name, ...location],
    {
      capture: true,
    },
  );
  const action = exists.code === 0 ? 'update' : 'create';
  await runChecked(deps, step.label, [
    'gcloud',
    'scheduler',
    'jobs',
    action,
    'http',
    job.name,
    ...schedulerArgs(job, url, settings),
  ]);
}

async function runSeek(step: Extract<Step, { kind: 'seek' }>, deps: StepDeps): Promise<void> {
  const listed = await runChecked(
    deps,
    `List the subscriptions of ${step.project}`,
    [
      'gcloud',
      'pubsub',
      'subscriptions',
      'list',
      '--project',
      step.project,
      '--format=value(name.basename())',
    ],
    { capture: true },
  );
  const time = deps.now().toISOString();
  for (const subscription of listed.stdout.split('\n').filter((line) => line.trim() !== '')) {
    await runChecked(deps, `Seek ${subscription}`, [
      'gcloud',
      'pubsub',
      'subscriptions',
      'seek',
      subscription.trim(),
      '--project',
      step.project,
      `--time=${time}`,
    ]);
  }
}

async function runHealth(step: Extract<Step, { kind: 'health' }>, deps: StepDeps): Promise<void> {
  const headers: Record<string, string> = {};
  if (step.privateService) {
    const token = await runChecked(
      deps,
      `Identity token for ${step.url}`,
      ['gcloud', 'auth', 'print-identity-token'],
      { capture: true },
    );
    headers['X-Serverless-Authorization'] = `Bearer ${token.stdout.trim()}`;
  }
  let status = 0;
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    status = await deps.fetchStatus(`${step.url}${step.path}`, headers).catch(() => 0);
    if (status >= 200 && status < 300) return;
    if (attempt < HEALTH_ATTEMPTS) await deps.sleep(HEALTH_DELAY_MS);
  }
  throw new Error(`${step.label} failed (HTTP ${status || 'no response'})`);
}

export async function executeSteps(
  steps: readonly Step[],
  deps: StepDeps,
  options: { apply: boolean },
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    deps.log(`[${index + 1}/${steps.length}] ${describeStep(step)}`);
    if (!options.apply) continue;
    if (step.kind === 'command') await runCommand(step, deps);
    else if (step.kind === 'scheduler') await runScheduler(step, deps);
    else if (step.kind === 'seek') await runSeek(step, deps);
    else await runHealth(step, deps);
  }
}
