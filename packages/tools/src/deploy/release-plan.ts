import {
  BACKEND_SERVICES,
  cloudRunEnv,
  pushServiceAccount,
  serviceAccountEmail,
  serviceUrl,
  type AppSecrets,
  type DeployUnit,
} from '@debus/contracts';

export const ENV_FILE_TOKEN = '{env-vars-file}';

export interface ReleaseSettings {
  projectId: string;
  projectNumber: string;
  region: string;
  artifactRepo: string;
  cloudSqlPrefix: string;
  deploySa: string;
  mediaBucket: string;
  appSecrets: AppSecrets;
}

export interface SchedulerJob {
  name: string;
  schedule: string;
  path: string;
  timeZone?: string;
}

export type Step =
  | {
      kind: 'command';
      label: string;
      argv: string[];
      env?: Record<string, string>;
      // A command whose standard output feeds the standard input of `argv` (git archive | docker build).
      stdinFrom?: string[];
      // Written to a private temporary file whose path replaces ENV_FILE_TOKEN in `argv`.
      envVarsFile?: Record<string, string>;
    }
  | { kind: 'scheduler'; label: string; job: SchedulerJob; url: string; settings: ReleaseSettings }
  // Marks as delivered every message published so far to every subscription of the project.
  | { kind: 'seek'; label: string; project: string }
  | {
      kind: 'health';
      label: string;
      url: string;
      path: string;
      // Private services take an identity token of the account running the release.
      privateService: boolean;
    };

export interface ReleasePlan {
  build: Step[];
  provision: Step[];
  deploy: Step[];
}

export function hasDatabase(unit: DeployUnit): boolean {
  return (BACKEND_SERVICES as readonly string[]).includes(unit);
}

export function imageRef(settings: ReleaseSettings, name: string, tag: string): string {
  const { region, projectId, artifactRepo } = settings;
  return `${region}-docker.pkg.dev/${projectId}/${artifactRepo}/${name}:${tag}`;
}

// The release tag is the commit SHA, so the image a service runs says which commit it came from.
export function tagOfImage(image: string): string | undefined {
  const tag = image.split('@')[0]?.split(':').pop();
  return tag && /^[0-9a-f]{40}$/.test(tag) ? tag : undefined;
}

function buildStep(unit: DeployUnit, name: string, sha: string, settings: ReleaseSettings): Step {
  const migrator = name !== unit;
  return {
    kind: 'command',
    label: `Build and push ${name}`,
    argv: [
      'docker',
      'buildx',
      'build',
      '--platform',
      'linux/amd64',
      '--provenance=false',
      '--push',
      '-f',
      `infra/docker/${unit === 'web' ? 'web' : 'service'}.Dockerfile`,
      '--build-arg',
      `SERVICE=${unit}`,
      ...(migrator ? ['--target', 'migrator'] : []),
      '-t',
      imageRef(settings, name, sha),
      '-',
    ],
    stdinFrom: ['git', 'archive', '--format=tar', sha],
  };
}

export function buildSteps(unit: DeployUnit, sha: string, settings: ReleaseSettings): Step[] {
  return [
    buildStep(unit, unit, sha, settings),
    ...(hasDatabase(unit) ? [buildStep(unit, `${unit}-migrate`, sha, settings)] : []),
  ];
}

// Topics and filtered subscriptions must exist before a service starts, or its messages are discarded.
export function provisionSteps(settings: ReleaseSettings): Step[] {
  return [
    {
      kind: 'command',
      label: 'Build the messaging package',
      argv: ['pnpm', 'turbo', 'run', 'build', '--filter=@debus/messaging', '--concurrency=1'],
    },
    {
      kind: 'command',
      label: 'Provision topics, push subscriptions and dead-letters',
      argv: ['node', 'scripts/provision-pubsub.mjs'],
      env: {
        DEBUS_ENV: 'production',
        PUBSUB_PROJECT_ID: settings.projectId,
        GCP_PROJECT_NUMBER: settings.projectNumber,
        GCP_REGION: settings.region,
      },
    },
  ];
}

export function schedulerJobs(unit: DeployUnit): SchedulerJob[] {
  const jobs: SchedulerJob[] = [];
  if (hasDatabase(unit)) {
    jobs.push({ name: `${unit}-outbox-flush`, schedule: '* * * * *', path: '/outbox/flush' });
  }
  if (unit === 'notificaciones') {
    jobs.push(
      {
        name: `${unit}-email-flush`,
        schedule: '* * * * *',
        path: '/internal/emails/flush',
        timeZone: 'America/Guatemala',
      },
      {
        name: `${unit}-license-alerts`,
        schedule: '0 8 * * *',
        path: '/internal/license-alerts/run',
        timeZone: 'America/Guatemala',
      },
    );
  }
  if (unit === 'ventas') {
    jobs.push({
      name: `${unit}-purchase-recovery`,
      schedule: '* * * * *',
      path: '/internal/purchases/recover',
    });
  }
  return jobs;
}

export function schedulerArgs(job: SchedulerJob, url: string, settings: ReleaseSettings): string[] {
  return [
    '--location',
    settings.region,
    '--schedule',
    job.schedule,
    ...(job.timeZone ? ['--time-zone', job.timeZone] : []),
    '--uri',
    `${url}${job.path}`,
    '--http-method',
    'POST',
    '--oidc-service-account-email',
    pushServiceAccount(settings.projectId),
    '--oidc-token-audience',
    url,
  ];
}

export function healthStep(unit: DeployUnit, settings: ReleaseSettings): Step {
  const publicUnit = unit === 'gateway' || unit === 'web';
  return {
    kind: 'health',
    label: `Check ${unit} health`,
    url: serviceUrl(unit, 'production', settings),
    path: unit === 'web' ? '/api/health' : '/health',
    privateService: !publicUnit,
  };
}

export function deploySteps(unit: DeployUnit, sha: string, settings: ReleaseSettings): Step[] {
  const { projectId, region, cloudSqlPrefix } = settings;
  const url = serviceUrl(unit, 'production', settings);
  const publicUnit = unit === 'gateway' || unit === 'web';
  const database = hasDatabase(unit);
  const serviceAccount = serviceAccountEmail(unit, projectId);
  const steps: Step[] = [];

  if (database) {
    steps.push({
      kind: 'command',
      label: `Run the ${unit} migrations`,
      argv: [
        'gcloud',
        'run',
        'jobs',
        'deploy',
        `${unit}-migrate`,
        '--image',
        imageRef(settings, `${unit}-migrate`, sha),
        '--region',
        region,
        '--service-account',
        serviceAccount,
        '--set-cloudsql-instances',
        `${cloudSqlPrefix}-${unit}`,
        '--set-secrets',
        `DATABASE_URL=${unit}-database-url:latest`,
        '--execute-now',
        '--wait',
      ],
    });
  }

  steps.push({
    kind: 'command',
    label: `Deploy ${unit} to Cloud Run`,
    argv: [
      'gcloud',
      'run',
      'deploy',
      unit,
      '--image',
      imageRef(settings, unit, sha),
      '--region',
      region,
      '--service-account',
      serviceAccount,
      '--min-instances',
      '0',
      '--max-instances',
      '1',
      '--env-vars-file',
      ENV_FILE_TOKEN,
      ...(database
        ? [
            '--set-cloudsql-instances',
            `${cloudSqlPrefix}-${unit}`,
            '--set-secrets',
            `DATABASE_URL=${unit}-database-url:latest`,
          ]
        : []),
      publicUnit ? '--allow-unauthenticated' : '--no-allow-unauthenticated',
    ],
    envVarsFile: cloudRunEnv(unit, 'production', settings),
  });

  steps.push(healthStep(unit, settings));

  for (const job of schedulerJobs(unit)) {
    steps.push({ kind: 'scheduler', label: `Schedule ${job.name}`, job, url, settings });
  }
  return steps;
}

export function planRelease(
  units: readonly DeployUnit[],
  sha: string,
  settings: ReleaseSettings,
): ReleasePlan {
  return {
    build: units.flatMap((unit) => buildSteps(unit, sha, settings)),
    provision: provisionSteps(settings),
    deploy: units.flatMap((unit) => deploySteps(unit, sha, settings)),
  };
}

export type DeployedTags = Partial<Record<DeployUnit, string | undefined>>;

// A unit ships when it was never deployed or when the commits since its own deployed one affect it.
export function selectUnits(
  units: readonly DeployUnit[],
  deployed: DeployedTags,
  affectedSince: (sha: string) => readonly DeployUnit[],
): DeployUnit[] {
  return units.filter((unit) => {
    const sha = deployed[unit];
    return sha === undefined || affectedSince(sha).includes(unit);
  });
}
