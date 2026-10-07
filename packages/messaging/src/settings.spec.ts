import { loadMessagingSettings } from './settings';

describe('loadMessagingSettings', () => {
  it('reads cloud settings', () => {
    const settings = loadMessagingSettings('flota', {
      DEBUS_ENV: 'production',
      PUBSUB_PROJECT_ID: 'p',
      PUBSUB_AUDIENCE: 'https://flota-1.r.run.app',
      PUBSUB_PUSH_SA: 'pubsub-invoker@p.iam.gserviceaccount.com',
    });

    expect(settings).toEqual({
      service: 'flota',
      environment: 'production',
      projectId: 'p',
      emulator: false,
      audience: 'https://flota-1.r.run.app',
      pushServiceAccount: 'pubsub-invoker@p.iam.gserviceaccount.com',
    });
  });

  it('defaults to local and detects the emulator', () => {
    const settings = loadMessagingSettings('gateway', {
      PUBSUB_PROJECT_ID: 'debus-local',
      PUBSUB_EMULATOR_HOST: 'localhost:8085',
    });

    expect(settings).toMatchObject({ environment: 'local', emulator: true });
  });

  it('fails fast without a project or with an unknown environment', () => {
    expect(() => loadMessagingSettings('flota', {})).toThrow('PUBSUB_PROJECT_ID is required');
    expect(() =>
      loadMessagingSettings('flota', { PUBSUB_PROJECT_ID: 'p', DEBUS_ENV: 'qa' }),
    ).toThrow();
  });
});
