import { planInputFromEnv } from './plan-input';

describe('planInputFromEnv', () => {
  it('defaults to the local emulator project', () => {
    expect(planInputFromEnv({})).toEqual({ env: 'local', projectId: 'debus-local' });
  });

  it('requires the Cloud Run location in the cloud', () => {
    expect(() => planInputFromEnv({ DEBUS_ENV: 'staging', PUBSUB_PROJECT_ID: 'p' })).toThrow(
      'GCP_PROJECT_NUMBER and GCP_REGION are required',
    );
    expect(
      planInputFromEnv({
        DEBUS_ENV: 'production',
        PUBSUB_PROJECT_ID: 'p',
        GCP_PROJECT_NUMBER: '1',
        GCP_REGION: 'r',
      }),
    ).toEqual({ env: 'production', projectId: 'p', location: { projectNumber: '1', region: 'r' } });
  });
});
