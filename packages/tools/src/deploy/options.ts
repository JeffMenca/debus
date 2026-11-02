import { DEPLOY_UNITS, type AppSecrets, type DeployUnit } from '@debus/contracts';
import type { ReleaseSettings } from './release-plan';

export type Phase = 'build' | 'provision' | 'deploy';
export const RESET_CONFIRMATION = 'wipe-production';
export const PHASES: readonly Phase[] = ['build', 'provision', 'deploy'];

export interface ReleaseOptions {
  command: 'plan' | 'release' | 'reset';
  // Empty means every unit the commits since its last release affect.
  units: DeployUnit[];
  phases: Phase[];
  apply: boolean;
  allowUnmerged: boolean;
}

const VALUE_FLAGS = new Set(['--units', '--phase', '--confirm']);
const SWITCHES = new Set(['--apply', '--allow-unmerged']);

function unitFrom(name: string): DeployUnit {
  const unit = DEPLOY_UNITS.find((candidate) => candidate === name);
  if (!unit) throw new Error(`Unknown unit "${name}". Units: ${DEPLOY_UNITS.join(', ')}`);
  return unit;
}

function phaseFrom(name: string): Phase {
  const phase = PHASES.find((candidate) => candidate === name);
  if (!phase) throw new Error(`Unknown phase "${name}". Phases: ${PHASES.join(', ')}`);
  return phase;
}

function split(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

// Changing production takes three separate decisions: the command, --apply and --confirm production.
export function parseReleaseArgs(argv: readonly string[]): ReleaseOptions {
  const [command, ...rest] = argv;
  if (command !== 'plan' && command !== 'release' && command !== 'reset') {
    throw new Error(
      'Usage: deploy <plan|release|reset> [--units a,b] [--phase build,provision,deploy]',
    );
  }
  const options: ReleaseOptions = {
    command,
    units: [],
    phases: [...PHASES],
    apply: false,
    allowUnmerged: false,
  };
  let confirmation = '';
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index] ?? '';
    if (SWITCHES.has(flag)) {
      if (flag === '--apply') options.apply = true;
      else options.allowUnmerged = true;
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown argument "${flag}"`);
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    index += 1;
    if (flag === '--units') options.units = split(value).map(unitFrom);
    else if (flag === '--phase') options.phases = split(value).map(phaseFrom);
    else confirmation = value;
  }
  // Emptying the databases has a phrase of its own, so a release confirmation never wipes anything.
  const phrase = options.command === 'reset' ? RESET_CONFIRMATION : 'production';
  if (options.apply && confirmation !== phrase) {
    throw new Error(`This changes production: it needs --apply --confirm ${phrase}`);
  }
  if (options.command === 'plan' && options.apply) {
    throw new Error('plan never changes anything, use release --apply');
  }
  return options;
}

export interface Discovered {
  projectId: string;
  projectNumber: string;
  mediaBucket: string;
}

// The defaults are what infra/gcp/bootstrap.sh creates; GCP_* variables override them.
export function releaseSettings(
  env: Record<string, string | undefined>,
  discovered: Discovered,
  appSecrets: AppSecrets,
): ReleaseSettings {
  const projectId = env.GCP_PROJECT_ID || discovered.projectId;
  const region = env.GCP_REGION || 'us-central1';
  return {
    projectId,
    projectNumber: env.GCP_PROJECT_NUMBER || discovered.projectNumber,
    region,
    artifactRepo: env.GCP_ARTIFACT_REPO || 'debus',
    cloudSqlPrefix: env.GCP_CLOUDSQL_PREFIX || `${projectId}:${region}:debus-pg`,
    deploySa: env.GCP_DEPLOY_SA || `github-deployer@${projectId}.iam.gserviceaccount.com`,
    mediaBucket: env.MEDIA_BUCKET || discovered.mediaBucket,
    appSecrets,
  };
}
