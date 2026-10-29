import type { AppSecrets } from '@debus/contracts';
import {
  ENV_FILE_TOKEN,
  buildSteps,
  deploySteps,
  hasDatabase,
  imageRef,
  planRelease,
  provisionSteps,
  schedulerArgs,
  schedulerJobs,
  selectUnits,
  tagOfImage,
  type ReleaseSettings,
  type Step,
} from './release-plan';

const SHA = 'a'.repeat(40);

const appSecrets: AppSecrets = {
  smtpUser: 'mail@example.test',
  smtpPassword: 'mail-password',
  jwtPrivateKey: 'private\nkey',
  jwtPublicKey: 'public\nkey',
  bootstrapAdminEmail: 'admin@example.test',
};

const settings: ReleaseSettings = {
  projectId: 'debus-x',
  projectNumber: '123',
  region: 'us-central1',
  artifactRepo: 'debus',
  cloudSqlPrefix: 'debus-x:us-central1:debus-pg',
  deploySa: 'deployer@debus-x.iam.gserviceaccount.com',
  mediaBucket: 'debus-x-media',
  appSecrets,
};

function commands(steps: Step[]) {
  return steps.flatMap((step) => (step.kind === 'command' ? [step] : []));
}

describe('tagOfImage', () => {
  it('reads the commit a service runs from its image', () => {
    expect(tagOfImage(`us-central1-docker.pkg.dev/p/debus/ventas:${SHA}`)).toBe(SHA);
  });

  it('ignores an image without a commit tag', () => {
    expect(tagOfImage('us-central1-docker.pkg.dev/p/debus/ventas:latest')).toBeUndefined();
    expect(tagOfImage('us-central1-docker.pkg.dev/p/debus/ventas')).toBeUndefined();
  });
});

describe('buildSteps', () => {
  it('builds a linux/amd64 image from the commit archive and its migration image', () => {
    const [image, migrator] = commands(buildSteps('ventas', SHA, settings));
    expect(image?.stdinFrom).toEqual(['git', 'archive', '--format=tar', SHA]);
    expect(image?.argv).toEqual(
      expect.arrayContaining([
        '--platform',
        'linux/amd64',
        '--push',
        'infra/docker/service.Dockerfile',
        'SERVICE=ventas',
        imageRef(settings, 'ventas', SHA),
      ]),
    );
    expect(image?.argv).not.toContain('--target');
    expect(migrator?.argv).toEqual(
      expect.arrayContaining(['--target', 'migrator', imageRef(settings, 'ventas-migrate', SHA)]),
    );
  });

  it('uses the web Dockerfile and no migration image for the web', () => {
    const steps = commands(buildSteps('web', SHA, settings));
    expect(steps).toHaveLength(1);
    expect(steps[0]?.argv).toContain('infra/docker/web.Dockerfile');
  });
});

describe('provisionSteps', () => {
  it('provisions Pub/Sub for production after building the messaging package', () => {
    const [build, provision] = commands(provisionSteps(settings));
    expect(build?.argv).toContain('--filter=@debus/messaging');
    expect(provision?.env).toEqual({
      DEBUS_ENV: 'production',
      PUBSUB_PROJECT_ID: 'debus-x',
      GCP_PROJECT_NUMBER: '123',
      GCP_REGION: 'us-central1',
    });
  });
});

describe('deploySteps', () => {
  it('migrates, deploys, checks health and schedules a service with a database', () => {
    const steps = deploySteps('ventas', SHA, settings);
    expect(steps.map((step) => step.kind)).toEqual([
      'command',
      'command',
      'health',
      'scheduler',
      'scheduler',
    ]);
    const [migrate, deploy] = commands(steps);
    expect(migrate?.argv).toEqual(
      expect.arrayContaining([
        'ventas-migrate',
        '--execute-now',
        '--wait',
        'DATABASE_URL=ventas-database-url:latest',
        'debus-x:us-central1:debus-pg-ventas',
      ]),
    );
    expect(deploy?.argv).toEqual(
      expect.arrayContaining([
        '--no-allow-unauthenticated',
        '--max-instances',
        '1',
        '--env-vars-file',
        'debus-ventas@debus-x.iam.gserviceaccount.com',
      ]),
    );
    expect(deploy?.argv).not.toContain('--set-env-vars');
    expect(deploy?.argv).toContain(ENV_FILE_TOKEN);
    expect(deploy?.envVarsFile).toMatchObject({ SERVICE_NAME: 'ventas', DEBUS_ENV: 'production' });
  });

  it('keeps the keys out of the command line and puts them in the variables file', () => {
    const [, deploy] = commands(deploySteps('administracion', SHA, settings));
    expect(deploy?.argv.join(' ')).not.toContain('private');
    expect(deploy?.envVarsFile).toMatchObject({
      JWT_PRIVATE_KEY: 'private\\nkey',
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test',
    });
  });

  it('opens the gateway and the web to the internet and skips their database', () => {
    for (const unit of ['gateway', 'web'] as const) {
      const steps = deploySteps(unit, SHA, settings);
      const [deploy] = commands(steps);
      expect(deploy?.argv).toContain('--allow-unauthenticated');
      expect(deploy?.argv).not.toContain('--set-secrets');
      expect(steps.map((step) => step.kind)).toEqual(['command', 'health']);
    }
  });

  it('checks the web on its own path and the private services with a token', () => {
    const [webHealth] = deploySteps('web', SHA, settings).filter((step) => step.kind === 'health');
    expect(webHealth).toMatchObject({ path: '/api/health', privateService: false });
    const [flotaHealth] = deploySteps('flota', SHA, settings).filter(
      (step) => step.kind === 'health',
    );
    expect(flotaHealth).toMatchObject({
      path: '/health',
      privateService: true,
      url: 'https://flota-123.us-central1.run.app',
    });
  });
});

describe('scheduler jobs', () => {
  it('gives every service with a database an outbox flush', () => {
    expect(schedulerJobs('flota').map((job) => job.name)).toEqual(['flota-outbox-flush']);
    expect(schedulerJobs('gateway')).toEqual([]);
  });

  it('adds the email and licence jobs to notificaciones and the recovery to ventas', () => {
    expect(schedulerJobs('notificaciones').map((job) => job.name)).toEqual([
      'notificaciones-outbox-flush',
      'notificaciones-email-flush',
      'notificaciones-license-alerts',
    ]);
    expect(schedulerJobs('ventas').map((job) => job.name)).toContain('ventas-purchase-recovery');
  });

  it('calls the service with the identity of the Pub/Sub invoker', () => {
    const [outbox] = schedulerJobs('ventas');
    const url = 'https://ventas-123.us-central1.run.app';
    const args = schedulerArgs(outbox!, url, settings);
    expect(args).toEqual(
      expect.arrayContaining([
        `${url}/outbox/flush`,
        'pubsub-invoker@debus-x.iam.gserviceaccount.com',
        url,
      ]),
    );
    expect(args).not.toContain('--time-zone');
    const [, emailFlush] = schedulerJobs('notificaciones');
    expect(schedulerArgs(emailFlush!, url, settings)).toEqual(
      expect.arrayContaining(['--time-zone', 'America/Guatemala']),
    );
  });
});

describe('planRelease', () => {
  it('plans the build, the provisioning and the deploy of each unit in order', () => {
    const plan = planRelease(['clientes', 'web'], SHA, settings);
    expect(commands(plan.build)).toHaveLength(3);
    expect(plan.provision).toHaveLength(2);
    const labels = plan.deploy.map((step) => step.label);
    expect(labels.indexOf('Deploy clientes to Cloud Run')).toBeLessThan(
      labels.indexOf('Deploy web to Cloud Run'),
    );
  });
});

describe('hasDatabase', () => {
  it('is true for the seven services and false for the gateway and the web', () => {
    expect(hasDatabase('viajes')).toBe(true);
    expect(hasDatabase('gateway')).toBe(false);
    expect(hasDatabase('web')).toBe(false);
  });
});

describe('selectUnits', () => {
  const old = 'b'.repeat(40);

  it('keeps the units the commits since their own release affect', () => {
    const affectedSince = jest.fn((sha: string) => (sha === old ? ['ventas' as const] : []));
    const picked = selectUnits(['ventas', 'flota'], { ventas: old, flota: SHA }, affectedSince);
    expect(picked).toEqual(['ventas']);
  });

  it('always ships a unit that was never deployed', () => {
    expect(selectUnits(['reportes'], {}, () => [])).toEqual(['reportes']);
  });
});
