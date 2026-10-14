import { SYNC_CALLS } from './events/sync-calls';
import {
  BACKEND_SERVICES,
  type BackendService,
  type CloudEnv,
  type CloudRunLocation,
  type DeployUnit,
  serviceUrl,
} from './topology';

export interface AppSecrets {
  smtpUser: string;
  smtpPassword: string;
  jwtPrivateKey: string;
  jwtPublicKey: string;
  bootstrapAdminEmail: string;
}

const APP_SECRET_VARIABLES: Readonly<Record<keyof AppSecrets, string>> = {
  smtpUser: 'SMTP_USER',
  smtpPassword: 'SMTP_PASSWORD',
  jwtPrivateKey: 'JWT_PRIVATE_KEY',
  jwtPublicKey: 'JWT_PUBLIC_KEY',
  bootstrapAdminEmail: 'BOOTSTRAP_ADMIN_EMAIL',
};

// What each unit refuses to start without.
const REQUIRED_APP_SECRETS: Readonly<Partial<Record<DeployUnit, readonly (keyof AppSecrets)[]>>> = {
  notificaciones: ['smtpUser', 'smtpPassword'],
  administracion: ['jwtPrivateKey', 'bootstrapAdminEmail'],
  gateway: ['jwtPublicKey'],
};

export function readAppSecrets(env: Record<string, string | undefined>): AppSecrets {
  const read = (key: keyof AppSecrets): string => env[APP_SECRET_VARIABLES[key]] ?? '';
  return {
    smtpUser: read('smtpUser'),
    smtpPassword: read('smtpPassword'),
    jwtPrivateKey: read('jwtPrivateKey'),
    jwtPublicKey: read('jwtPublicKey'),
    bootstrapAdminEmail: read('bootstrapAdminEmail'),
  };
}

// Returns variable names only, so callers can report them without touching the values.
export function missingAppValues(unit: DeployUnit, appSecrets: AppSecrets): string[] {
  return (REQUIRED_APP_SECRETS[unit] ?? [])
    .filter((key) => appSecrets[key].trim() === '')
    .map((key) => APP_SECRET_VARIABLES[key]);
}

export interface CloudRunSettings extends CloudRunLocation {
  projectId: string;
  mediaBucket: string;
  appSecrets: AppSecrets;
}

// Cloud Run env vars are single line; services turn \n back into new lines.
export function escapeNewlines(value: string): string {
  return value.trim().replace(/\r?\n/g, '\\n');
}

export function serviceUrlVariable(service: BackendService): string {
  return `SERVICE_URL_${service.toUpperCase()}`;
}

export function pushServiceAccount(projectId: string): string {
  return `pubsub-invoker@${projectId}.iam.gserviceaccount.com`;
}

// The identity each unit runs as on Cloud Run (bootstrap.sh creates it, release.yml assigns it).
export function serviceAccountEmail(unit: DeployUnit, projectId: string): string {
  return `debus-${unit}@${projectId}.iam.gserviceaccount.com`;
}

export function cloudRunEnv(
  unit: DeployUnit,
  env: CloudEnv,
  settings: CloudRunSettings,
): Record<string, string> {
  const url = (target: DeployUnit): string => serviceUrl(target, env, settings);
  const { appSecrets } = settings;
  const base = { SERVICE_NAME: unit, DEBUS_ENV: env };
  if (unit === 'web') return { ...base, API_URL: url('gateway'), APP_ENV: env };

  const pubsub = { PUBSUB_PROJECT_ID: settings.projectId };
  if (unit === 'gateway') {
    const serviceUrls = Object.fromEntries(
      BACKEND_SERVICES.map((service) => [serviceUrlVariable(service), url(service)]),
    );
    return {
      ...base,
      ...pubsub,
      SERVICE_AUTH: 'google',
      CORS_ORIGINS: url('web'),
      JWT_PUBLIC_KEY: escapeNewlines(appSecrets.jwtPublicKey),
      ...serviceUrls,
    };
  }

  // A service that calls others synchronously needs their URLs and the identity token to do it.
  const peers = SYNC_CALLS.filter((call) => call.from === unit).map((call) => call.to);
  return {
    ...base,
    ...pubsub,
    PUBSUB_AUDIENCE: url(unit),
    PUBSUB_PUSH_SA: pushServiceAccount(settings.projectId),
    DB_POOL_MAX: '2',
    ...(peers.length > 0 && {
      SERVICE_AUTH: 'google',
      ...Object.fromEntries(peers.map((peer) => [serviceUrlVariable(peer), url(peer)])),
    }),
    ...(unit === 'flota' && { MEDIA_BUCKET: settings.mediaBucket }),
    ...(unit === 'administracion' && {
      WEB_URL: url('web'),
      BOOTSTRAP_ADMIN_EMAIL: appSecrets.bootstrapAdminEmail,
      JWT_PRIVATE_KEY: escapeNewlines(appSecrets.jwtPrivateKey),
    }),
    ...(unit === 'notificaciones' && {
      SMTP_USER: appSecrets.smtpUser,
      SMTP_PASSWORD: appSecrets.smtpPassword,
    }),
  };
}
