import { cloudRunEnv } from './cloud-run-env';

const settings = {
  projectId: 'debus-prod',
  projectNumber: '123456',
  region: 'us-central1',
  mediaBucket: 'debus-prod-debus-media',
};

describe('cloudRunEnv', () => {
  it('points the web at the gateway of the same environment', () => {
    expect(cloudRunEnv('web', 'staging', settings)).toEqual({
      SERVICE_NAME: 'web',
      DEBUS_ENV: 'staging',
      API_URL: 'https://gateway-staging-123456.us-central1.run.app',
      APP_ENV: 'staging',
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
    expect(cloudRunEnv('ventas', 'staging', settings)).toEqual({
      SERVICE_NAME: 'ventas',
      DEBUS_ENV: 'staging',
      PUBSUB_PROJECT_ID: 'debus-prod',
      PUBSUB_AUDIENCE: 'https://ventas-staging-123456.us-central1.run.app',
      PUBSUB_PUSH_SA: 'pubsub-invoker@debus-prod.iam.gserviceaccount.com',
      DB_POOL_MAX: '2',
    });
  });

  it('gives only flota the media bucket', () => {
    expect(cloudRunEnv('flota', 'production', settings).MEDIA_BUCKET).toBe(
      'debus-prod-debus-media',
    );
  });
});
