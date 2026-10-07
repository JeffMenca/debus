import {
  BACKEND_SERVICES,
  type BackendService,
  type CloudEnv,
  type CloudRunLocation,
  type DeployUnit,
  serviceUrl,
} from './topology';

export interface CloudRunSettings extends CloudRunLocation {
  projectId: string;
  mediaBucket: string;
}

export function serviceUrlVariable(service: BackendService): string {
  return `SERVICE_URL_${service.toUpperCase()}`;
}

export function pushServiceAccount(projectId: string): string {
  return `pubsub-invoker@${projectId}.iam.gserviceaccount.com`;
}

export function cloudRunEnv(
  unit: DeployUnit,
  env: CloudEnv,
  settings: CloudRunSettings,
): Record<string, string> {
  const url = (target: DeployUnit): string => serviceUrl(target, env, settings);
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
      ...serviceUrls,
    };
  }

  return {
    ...base,
    ...pubsub,
    PUBSUB_AUDIENCE: url(unit),
    PUBSUB_PUSH_SA: pushServiceAccount(settings.projectId),
    DB_POOL_MAX: '2',
    ...(unit === 'flota' && { MEDIA_BUCKET: settings.mediaBucket }),
  };
}
