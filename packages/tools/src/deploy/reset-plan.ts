import {
  BACKEND_SERVICES,
  DEPLOY_UNITS,
  serviceAccountEmail,
  type BackendService,
} from '@debus/contracts';
import {
  ENV_FILE_TOKEN,
  healthStep,
  schedulerJobs,
  type ReleaseSettings,
  type Step,
} from './release-plan';

// Empties every table of the database except Prisma's migration history. TRUNCATE does not fire the
// row-level triggers that keep some records immutable, and one statement empties all tables at once, so
// foreign keys never get in the way. It all runs in one transaction: it empties everything or nothing.
export const WIPE_SQL = `DO $$
DECLARE tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END
$$;`;

// The command of the temporary job: the SQL arrives in an environment variable, so it needs no quoting.
export const WIPE_ARGS = '-c,printf "%s" "$WIPE_SQL" | pnpm prisma db execute --stdin';

export interface ResetInput {
  settings: ReleaseSettings;
  // The image of each service's migration job: it carries the Prisma CLI and the database configuration.
  migrationImages: Record<BackendService, string>;
  // Distinguishes the restart revision of the administration service.
  restartedAt: string;
}

function schedulerCommand(action: 'pause' | 'resume', name: string, region: string): Step {
  return {
    kind: 'command',
    label: `${action === 'pause' ? 'Pause' : 'Resume'} ${name}`,
    argv: ['gcloud', 'scheduler', 'jobs', action, name, '--location', region],
  };
}

function wipeSteps(service: BackendService, input: ResetInput): Step[] {
  const { settings, migrationImages } = input;
  const job = `${service}-reset`;
  return [
    {
      kind: 'command',
      label: `Empty the ${service} database`,
      argv: [
        'gcloud',
        'run',
        'jobs',
        'deploy',
        job,
        '--image',
        migrationImages[service],
        '--region',
        settings.region,
        '--service-account',
        serviceAccountEmail(service, settings.projectId),
        '--set-cloudsql-instances',
        `${settings.cloudSqlPrefix}-${service}`,
        '--set-secrets',
        `DATABASE_URL=${service}-database-url:latest`,
        '--env-vars-file',
        ENV_FILE_TOKEN,
        '--command',
        'sh',
        `--args=${WIPE_ARGS}`,
        '--max-retries',
        '0',
        '--execute-now',
        '--wait',
      ],
      envVarsFile: { WIPE_SQL },
    },
    {
      kind: 'command',
      label: `Remove the temporary ${job} job`,
      argv: ['gcloud', 'run', 'jobs', 'delete', job, '--region', settings.region, '--quiet'],
    },
  ];
}

// Quiets everything that publishes or consumes, empties the seven databases, drops the events still on
// their way and restarts the administration service so it invites the first administrator again.
// If a step fails the schedulers stay paused, which is the safe state; running the reset again is harmless.
export function planReset(input: ResetInput): Step[] {
  const { settings } = input;
  const jobs = DEPLOY_UNITS.flatMap((unit) => schedulerJobs(unit).map((job) => job.name));
  const seek: Step = {
    kind: 'seek',
    label: 'Drop the pending events',
    project: settings.projectId,
  };
  return [
    ...jobs.map((name) => schedulerCommand('pause', name, settings.region)),
    seek,
    ...BACKEND_SERVICES.flatMap((service) => wipeSteps(service, input)),
    { ...seek, label: 'Drop the events published meanwhile' },
    {
      kind: 'command',
      label: 'Restart administracion so it creates the first administrator',
      argv: [
        'gcloud',
        'run',
        'services',
        'update',
        'administracion',
        '--region',
        settings.region,
        `--update-labels=restarted=${input.restartedAt}`,
      ],
    },
    healthStep('administracion', settings),
    ...jobs.map((name) => schedulerCommand('resume', name, settings.region)),
  ];
}
