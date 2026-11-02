import { appValuesFromLive, envOf, imageOf, mediaBucketOf } from './live-env';

const service = (image: string, env: { name: string; value?: string }[]) => ({
  spec: { template: { spec: { containers: [{ image, env }] } } },
});

describe('imageOf', () => {
  it('reads the image of the first container', () => {
    expect(imageOf(service('registry/ventas:tag', []))).toBe('registry/ventas:tag');
  });

  it('is undefined for a service that does not exist', () => {
    expect(imageOf(undefined)).toBeUndefined();
    expect(imageOf({})).toBeUndefined();
  });
});

describe('envOf', () => {
  it('keeps plain variables and drops the secret references', () => {
    const description = service('i', [
      { name: 'DEBUS_ENV', value: 'production' },
      { name: 'DATABASE_URL' },
    ]);
    expect(envOf(description)).toEqual({ DEBUS_ENV: 'production' });
  });

  it('is empty without a container', () => {
    expect(envOf(undefined)).toEqual({});
  });
});

describe('appValuesFromLive', () => {
  const descriptions = {
    administracion: service('i', [
      { name: 'JWT_PRIVATE_KEY', value: 'live-private' },
      { name: 'BOOTSTRAP_ADMIN_EMAIL', value: 'admin@example.test' },
    ]),
    gateway: service('i', [
      { name: 'JWT_PUBLIC_KEY', value: 'live-public' },
      { name: 'DOCS_PASSWORD', value: 'live-docs' },
    ]),
    notificaciones: service('i', [
      { name: 'SMTP_USER', value: 'mail@example.test' },
      { name: 'SMTP_PASSWORD', value: 'live-password' },
    ]),
  };

  it('collects each value from the service that runs with it', () => {
    expect(appValuesFromLive({}, descriptions)).toEqual({
      JWT_PRIVATE_KEY: 'live-private',
      BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test',
      JWT_PUBLIC_KEY: 'live-public',
      DOCS_PASSWORD: 'live-docs',
      SMTP_USER: 'mail@example.test',
      SMTP_PASSWORD: 'live-password',
    });
  });

  it('prefers a value given in the environment, such as a rotated key', () => {
    const values = appValuesFromLive({ JWT_PRIVATE_KEY: 'rotated' }, descriptions);
    expect(values.JWT_PRIVATE_KEY).toBe('rotated');
  });

  it('leaves out what neither the environment nor the service has', () => {
    expect(appValuesFromLive({}, {})).toEqual({});
  });
});

describe('mediaBucketOf', () => {
  it('reads the bucket of the fleet service', () => {
    expect(mediaBucketOf(service('i', [{ name: 'MEDIA_BUCKET', value: 'bucket' }]))).toBe('bucket');
    expect(mediaBucketOf(undefined)).toBe('');
  });
});
