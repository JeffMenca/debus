import type { BackendService } from '@debus/contracts';
import { BACKEND_SERVICES } from '@debus/contracts';
import type { ReleaseSettings, Step } from './release-plan';
import { ENV_FILE_TOKEN } from './release-plan';
import { WIPE_ARGS, WIPE_SQL, planReset } from './reset-plan';

const settings = {
  projectId: 'debus-x',
  projectNumber: '123',
  region: 'us-central1',
  cloudSqlPrefix: 'debus-x:us-central1:debus-pg',
} as ReleaseSettings;

const migrationImages = Object.fromEntries(
  BACKEND_SERVICES.map((service) => [service, `registry/${service}-migrate:abc`]),
) as Record<BackendService, string>;

const steps = planReset({ settings, migrationImages, restartedAt: '1790000000' });
const labels = steps.map((step) => step.label);
const commands = steps.flatMap((step) => (step.kind === 'command' ? [step] : []));

describe('WIPE_SQL', () => {
  it('empties every table but the migration history in one statement', () => {
    expect(WIPE_SQL).toContain("tablename <> '_prisma_migrations'");
    expect(WIPE_SQL).toContain("schemaname = 'public'");
    expect(WIPE_SQL).toContain('TRUNCATE TABLE');
    expect(WIPE_SQL).toContain('RESTART IDENTITY CASCADE');
  });

  it('travels through an environment variable, so the command needs no quoting of it', () => {
    expect(WIPE_ARGS).toContain('"$WIPE_SQL"');
    expect(WIPE_ARGS).toContain('prisma db execute --stdin');
  });
});

describe('planReset', () => {
  it('pauses the ten scheduler jobs before touching anything', () => {
    const pauses = commands.filter((step) => step.argv[3] === 'pause');
    expect(pauses).toHaveLength(10);
    expect(steps.slice(0, 10).every((step) => step.label.startsWith('Pause '))).toBe(true);
    expect(pauses.map((step) => step.argv[4])).toEqual(
      expect.arrayContaining(['ventas-purchase-recovery', 'notificaciones-email-flush']),
    );
  });

  it('drops the pending events before and after emptying the databases', () => {
    const seeks = steps.flatMap((step, index) => (step.kind === 'seek' ? [index] : []));
    const wipes = labels.flatMap((label, index) => (label.startsWith('Empty ') ? [index] : []));
    expect(seeks).toHaveLength(2);
    expect(seeks[0]).toBeLessThan(Math.min(...wipes));
    expect(seeks[1]).toBeGreaterThan(Math.max(...wipes));
  });

  it('empties the seven databases with a temporary job that it removes afterwards', () => {
    const wipes = commands.filter((step) => step.label.startsWith('Empty '));
    expect(wipes).toHaveLength(7);
    const ventas = wipes.find((step) => step.argv.includes('ventas-reset'));
    expect(ventas?.argv).toEqual(
      expect.arrayContaining([
        'registry/ventas-migrate:abc',
        'debus-ventas@debus-x.iam.gserviceaccount.com',
        'debus-x:us-central1:debus-pg-ventas',
        'DATABASE_URL=ventas-database-url:latest',
        '--max-retries',
        '--execute-now',
        '--wait',
        ENV_FILE_TOKEN,
        `--args=${WIPE_ARGS}`,
      ]),
    );
    expect(ventas?.envVarsFile).toEqual({ WIPE_SQL });
    expect(commands.filter((step) => step.label.startsWith('Remove'))).toHaveLength(7);
    for (const service of BACKEND_SERVICES) {
      const wipe = labels.indexOf(`Empty the ${service} database`);
      expect(labels[wipe + 1]).toBe(`Remove the temporary ${service}-reset job`);
    }
  });

  it('restarts the administration service without changing its configuration and checks it', () => {
    const restart = commands.find((step) => step.label.startsWith('Restart administracion'));
    expect(restart?.argv).toEqual([
      'gcloud',
      'run',
      'services',
      'update',
      'administracion',
      '--region',
      'us-central1',
      '--update-labels=restarted=1790000000',
    ]);
    const after = steps[labels.indexOf(restart!.label) + 1] as Extract<Step, { kind: 'health' }>;
    expect(after).toMatchObject({
      kind: 'health',
      url: 'https://administracion-123.us-central1.run.app',
    });
  });

  it('resumes the same jobs at the end', () => {
    const resumes = steps.slice(-10);
    expect(resumes.every((step) => step.label.startsWith('Resume '))).toBe(true);
    expect(resumes.map((step) => step.label.replace('Resume ', '')).sort()).toEqual(
      commands
        .filter((step) => step.argv[3] === 'pause')
        .map((step) => step.argv[4]!)
        .sort(),
    );
  });
});
