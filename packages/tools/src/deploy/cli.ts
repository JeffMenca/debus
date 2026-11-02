#!/usr/bin/env node
// Releases production from this machine when GitHub Actions is not available: the same steps as
// deploy.yml and release.yml, one unit at a time, and a dry run unless --apply --confirm production.
import { spawn, spawnSync } from 'node:child_process';
import {
  BACKEND_SERVICES,
  DEPLOY_UNITS,
  missingAppValues,
  readAppSecrets,
  type BackendService,
  type DeployUnit,
} from '@debus/contracts';
import { appValuesFromLive, imageOf, mediaBucketOf } from './live-env';
import { parseReleaseArgs, releaseSettings, type ReleaseOptions } from './options';
import { planReset } from './reset-plan';
import { planRelease, selectUnits, tagOfImage, type DeployedTags, type Step } from './release-plan';
import { executeSteps, type RunOptions, type RunResult, type StepDeps } from './run-steps';

function capture(argv: string[], env?: Record<string, string>): RunResult {
  const [command = '', ...args] = argv;
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return { code: result.status ?? 1, stdout: result.stdout ?? '' };
}

function exited(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve) => {
    child.on('error', () => resolve(127));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function run(argv: string[], options: RunOptions = {}): Promise<RunResult> {
  const [command = '', ...args] = argv;
  const env = { ...process.env, ...options.env };
  if (options.capture) {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    return { code: await exited(child), stdout };
  }
  if (!options.stdinFrom) {
    return { code: await exited(spawn(command, args, { env, stdio: 'inherit' })), stdout: '' };
  }
  const [producerCommand = '', ...producerArgs] = options.stdinFrom;
  const producer = spawn(producerCommand, producerArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  const consumer = spawn(command, args, { env, stdio: ['pipe', 'inherit', 'inherit'] });
  producer.stdout?.pipe(consumer.stdin!);
  const [producerCode, consumerCode] = await Promise.all([exited(producer), exited(consumer)]);
  return { code: consumerCode || producerCode, stdout: '' };
}

const deps: StepDeps = {
  run,
  fetchStatus: async (url, headers) =>
    (await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })).status,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  log: (line) => console.log(line),
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function git(...args: string[]): string {
  return capture(['git', ...args]).stdout.trim();
}

function affectedSince(sha: string): DeployUnit[] {
  const result = capture(['node', 'scripts/affected-deployables.mjs'], { TURBO_SCM_BASE: sha });
  if (result.code !== 0) fail(`Could not tell what changed since ${sha.slice(0, 7)}`);
  return JSON.parse(result.stdout) as DeployUnit[];
}

function describeUnit(unit: DeployUnit, region: string): unknown {
  const result = capture([
    'gcloud',
    'run',
    'services',
    'describe',
    unit,
    '--region',
    region,
    '--format=json',
  ]);
  return result.code === 0 ? (JSON.parse(result.stdout) as unknown) : undefined;
}

// Images are built from the commit, not from this tree; only the Pub/Sub step reads these paths from it.
const COMMIT_ONLY_PATHS = ['packages/contracts', 'packages/messaging', 'scripts'];

function checkMachine(options: ReleaseOptions): string {
  if (git('status', '--porcelain', '--', ...COMMIT_ONLY_PATHS)) {
    fail(`Commit or discard the changes in ${COMMIT_ONLY_PATHS.join(', ')} before releasing.`);
  }
  const sha = git('rev-parse', 'HEAD');
  if (!options.allowUnmerged && sha !== git('rev-parse', 'origin/main')) {
    fail('HEAD is not origin/main. Run git fetch and check out main, or pass --allow-unmerged.');
  }
  return sha;
}

function checkTools(options: ReleaseOptions): void {
  if (options.phases.includes('build') && capture(['docker', 'info']).code !== 0) {
    fail('Docker is not running. Start OrbStack first.');
  }
  if (
    options.phases.includes('provision') &&
    capture(['gcloud', 'auth', 'application-default', 'print-access-token']).code !== 0
  ) {
    fail('Run gcloud auth application-default login: the Pub/Sub step reads those credentials.');
  }
}

function printDeployed(deployed: DeployedTags, head: string): void {
  console.log(`Release commit: ${head}`);
  for (const unit of DEPLOY_UNITS) {
    console.log(`  ${unit.padEnd(15)} running ${deployed[unit]?.slice(0, 7) ?? 'nothing'}`);
  }
}

async function reset(options: ReleaseOptions): Promise<void> {
  const region = process.env.GCP_REGION || 'us-central1';
  const projectId =
    process.env.GCP_PROJECT_ID ||
    capture(['gcloud', 'config', 'get-value', 'project']).stdout.trim();
  if (!projectId) fail('No Google Cloud project: run gcloud config set project <id>.');
  const projectNumber =
    process.env.GCP_PROJECT_NUMBER ||
    capture([
      'gcloud',
      'projects',
      'describe',
      projectId,
      '--format=value(projectNumber)',
    ]).stdout.trim();
  const settings = releaseSettings(
    process.env,
    { projectId, projectNumber, mediaBucket: '' },
    readAppSecrets({}),
  );
  const migrationImages = Object.fromEntries(
    BACKEND_SERVICES.map((service) => {
      const image = capture([
        'gcloud',
        'run',
        'jobs',
        'describe',
        `${service}-migrate`,
        '--region',
        region,
        '--format=value(spec.template.spec.template.spec.containers[0].image)',
      ]).stdout.trim();
      if (!image) fail(`Could not find the ${service}-migrate job: release ${service} first.`);
      return [service, image];
    }),
  ) as Record<BackendService, string>;
  const steps = planReset({
    settings,
    migrationImages,
    restartedAt: String(Math.floor(Date.now() / 1000)),
  });
  console.log(
    options.apply
      ? `\nEMPTYING THE PRODUCTION DATABASES of ${projectId}:\n`
      : '\nDry run (nothing changes):\n',
  );
  await executeSteps(steps, deps, { apply: options.apply });
  if (options.apply) console.log('\nDone. Now run the seed.');
}

async function main(): Promise<void> {
  const options = parseReleaseArgs(process.argv.slice(2));
  if (options.command === 'reset') return reset(options);
  const head = checkMachine(options);
  const region = process.env.GCP_REGION || 'us-central1';
  const projectId =
    process.env.GCP_PROJECT_ID ||
    capture(['gcloud', 'config', 'get-value', 'project']).stdout.trim();
  if (!projectId) fail('No Google Cloud project: run gcloud config set project <id>.');

  const descriptions = Object.fromEntries(
    DEPLOY_UNITS.map((unit) => [unit, describeUnit(unit, region)]),
  ) as Partial<Record<DeployUnit, unknown>>;
  const deployed: DeployedTags = Object.fromEntries(
    DEPLOY_UNITS.map((unit) => [unit, tagOfImage(imageOf(descriptions[unit]) ?? '')]),
  );
  printDeployed(deployed, head);

  const units =
    options.units.length > 0 ? options.units : selectUnits(DEPLOY_UNITS, deployed, affectedSince);
  if (units.length === 0) {
    console.log('\nNothing to release: production already runs these changes.');
    return;
  }
  console.log(`\nUnits to release: ${units.join(', ')}`);

  const appSecrets = readAppSecrets(appValuesFromLive(process.env, descriptions));
  const missing = units.flatMap((unit) =>
    missingAppValues(unit, appSecrets).map((name) => `${unit}: ${name}`),
  );
  if (missing.length > 0) {
    fail(
      `Missing values (not found in the environment or in the running services): ${missing.join(', ')}`,
    );
  }

  const projectNumber =
    process.env.GCP_PROJECT_NUMBER ||
    capture([
      'gcloud',
      'projects',
      'describe',
      projectId,
      '--format=value(projectNumber)',
    ]).stdout.trim();
  const settings = releaseSettings(
    process.env,
    { projectId, projectNumber, mediaBucket: mediaBucketOf(descriptions.flota) },
    appSecrets,
  );
  const plan = planRelease(units, head, settings);
  const steps: Step[] = options.phases.flatMap((phase) => plan[phase]);

  if (options.apply) checkTools(options);
  console.log(options.apply ? '\nApplying to production:\n' : '\nDry run (nothing changes):\n');
  await executeSteps(steps, deps, { apply: options.apply });
  if (options.apply) console.log('\nDone.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
