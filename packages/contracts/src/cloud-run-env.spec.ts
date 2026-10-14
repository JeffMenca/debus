import { cloudRunEnv, escapeNewlines, missingAppValues, readAppSecrets } from './cloud-run-env';
import { serviceUrl } from './topology';

const appSecrets = {
  smtpUser: 'debus.notificaciones@gmail.com',
  smtpPassword: 'abcdefghijklmnop',
  jwtPrivateKey: '-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n',
  jwtPublicKey: '-----BEGIN PUBLIC KEY-----\nBBB\n-----END PUBLIC KEY-----\n',
  bootstrapAdminEmail: 'admin@correo.com',
};

const settings = {
  projectId: 'debus-prod',
  projectNumber: '123456',
  region: 'us-central1',
  mediaBucket: 'debus-prod-debus-media',
  appSecrets,
};

describe('cloudRunEnv', () => {
  it('points the web at the gateway of the same environment', () => {
    expect(cloudRunEnv('web', 'production', settings)).toEqual({
      SERVICE_NAME: 'web',
      DEBUS_ENV: 'production',
      API_URL: 'https://gateway-123456.us-central1.run.app',
      APP_ENV: 'production',
    });
  });

  it('gives the gateway every backend URL, Google auth and the web origin', () => {
    const env = cloudRunEnv('gateway', 'production', settings);

    expect(env).toMatchObject({
      SERVICE_AUTH: 'google',
      PUBSUB_PROJECT_ID: 'debus-prod',
      CORS_ORIGINS: 'https://web-123456.us-central1.run.app',
      SERVICE_URL_FLOTA: 'https://flota-123456.us-central1.run.app',
      SERVICE_URL_NOTIFICACIONES: 'https://notificaciones-123456.us-central1.run.app',
    });
  });

  it('configures push verification and a small pool for backend services', () => {
    expect(cloudRunEnv('reportes', 'production', settings)).toEqual({
      SERVICE_NAME: 'reportes',
      DEBUS_ENV: 'production',
      PUBSUB_PROJECT_ID: 'debus-prod',
      PUBSUB_AUDIENCE: 'https://reportes-123456.us-central1.run.app',
      PUBSUB_PUSH_SA: 'pubsub-invoker@debus-prod.iam.gserviceaccount.com',
      DB_POOL_MAX: '2',
    });
  });

  it('gives each service the URL of the peers it calls synchronously', () => {
    const viajes = cloudRunEnv('viajes', 'production', settings);
    expect(viajes).toMatchObject({
      SERVICE_AUTH: 'google',
      SERVICE_URL_FLOTA: expect.stringContaining('flota'),
    });
    expect(viajes).not.toHaveProperty('SERVICE_URL_VENTAS');
    expect(cloudRunEnv('ventas', 'production', settings)).toMatchObject({
      SERVICE_URL_CLIENTES: expect.any(String),
      SERVICE_URL_VIAJES: expect.any(String),
    });
    expect(cloudRunEnv('clientes', 'production', settings)).not.toHaveProperty('SERVICE_URL_FLOTA');
    expect(cloudRunEnv('reportes', 'production', settings)).not.toHaveProperty('SERVICE_AUTH');
  });

  it('gives only flota the media bucket', () => {
    expect(cloudRunEnv('flota', 'production', settings).MEDIA_BUCKET).toBe(
      'debus-prod-debus-media',
    );
  });
});

describe('application secrets', () => {
  it('gives administracion the signing key in one line, the web url and the first admin', () => {
    const env = cloudRunEnv('administracion', 'production', settings);

    expect(env.JWT_PRIVATE_KEY).toBe(
      '-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----',
    );
    expect(env.WEB_URL).toBe(serviceUrl('web', 'production', settings));
    expect(env.BOOTSTRAP_ADMIN_EMAIL).toBe('admin@correo.com');
    expect(env).not.toHaveProperty('SMTP_PASSWORD');
  });

  it('gives the gateway only the public key', () => {
    const env = cloudRunEnv('gateway', 'production', settings);

    expect(env.JWT_PUBLIC_KEY).toContain('BEGIN PUBLIC KEY');
    expect(env.JWT_PUBLIC_KEY).not.toContain('\n');
    expect(env).not.toHaveProperty('JWT_PRIVATE_KEY');
  });

  it('gives notificaciones the Gmail account', () => {
    expect(cloudRunEnv('notificaciones', 'production', settings)).toMatchObject({
      SMTP_USER: 'debus.notificaciones@gmail.com',
      SMTP_PASSWORD: 'abcdefghijklmnop',
    });
  });

  it('keeps every other unit free of secrets', () => {
    for (const unit of ['flota', 'viajes', 'ventas', 'clientes', 'reportes', 'web'] as const) {
      const values = Object.values(cloudRunEnv(unit, 'production', settings)).join(' ');
      expect(values).not.toContain('abcdefghijklmnop');
      expect(values).not.toContain('PRIVATE KEY');
      expect(values).not.toContain('PUBLIC KEY');
    }
  });
});

describe('escapeNewlines', () => {
  it('turns line breaks into literal \\n and trims the ends', () => {
    expect(escapeNewlines('  a\r\nb\nc\n')).toBe('a\\nb\\nc');
  });
});

describe('readAppSecrets', () => {
  it('reads the five values from the process environment, empty when absent', () => {
    expect(
      readAppSecrets({
        SMTP_USER: 'u',
        SMTP_PASSWORD: 'p',
        JWT_PRIVATE_KEY: 'k1',
        JWT_PUBLIC_KEY: 'k2',
        BOOTSTRAP_ADMIN_EMAIL: 'a@b.com',
      }),
    ).toEqual({
      smtpUser: 'u',
      smtpPassword: 'p',
      jwtPrivateKey: 'k1',
      jwtPublicKey: 'k2',
      bootstrapAdminEmail: 'a@b.com',
    });
    expect(readAppSecrets({})).toEqual({
      smtpUser: '',
      smtpPassword: '',
      jwtPrivateKey: '',
      jwtPublicKey: '',
      bootstrapAdminEmail: '',
    });
  });
});

describe('missingAppValues', () => {
  const empty = readAppSecrets({});

  it('names what each unit needs before it can start', () => {
    expect(missingAppValues('notificaciones', empty)).toEqual(['SMTP_USER', 'SMTP_PASSWORD']);
    expect(missingAppValues('administracion', empty)).toEqual([
      'JWT_PRIVATE_KEY',
      'BOOTSTRAP_ADMIN_EMAIL',
    ]);
    expect(missingAppValues('gateway', empty)).toEqual(['JWT_PUBLIC_KEY']);
  });

  it('reports only the values that are missing, treating blanks as missing', () => {
    expect(missingAppValues('notificaciones', { ...appSecrets, smtpPassword: '' })).toEqual([
      'SMTP_PASSWORD',
    ]);
    expect(missingAppValues('gateway', { ...appSecrets, jwtPublicKey: '  \n' })).toEqual([
      'JWT_PUBLIC_KEY',
    ]);
  });

  it('reports nothing when the unit has everything', () => {
    expect(missingAppValues('notificaciones', appSecrets)).toEqual([]);
    expect(missingAppValues('administracion', appSecrets)).toEqual([]);
    expect(missingAppValues('gateway', appSecrets)).toEqual([]);
  });

  it('never asks for values the unit does not use', () => {
    for (const unit of ['flota', 'viajes', 'ventas', 'clientes', 'reportes', 'web'] as const) {
      expect(missingAppValues(unit, empty)).toEqual([]);
    }
  });
});
