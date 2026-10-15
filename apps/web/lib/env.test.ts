import { DEBUS_ENVIRONMENTS } from '@debus/contracts';
import { LOCAL_RUNTIME_ENV, readRuntimeEnv, runtimeEnv } from './env';

describe('runtime env', () => {
  afterEach(() => {
    delete window.__DEBUS_ENV__;
  });

  it('reads the server variables', () => {
    expect(readRuntimeEnv({ API_URL: 'https://gw/', APP_ENV: 'production' })).toEqual({
      apiUrl: 'https://gw',
      appEnv: 'production',
    });
  });

  it('falls back to local defaults for missing or unknown values', () => {
    expect(readRuntimeEnv({ APP_ENV: 'qa' })).toEqual(LOCAL_RUNTIME_ENV);
  });

  it('reads the browser config injected by /env.js', () => {
    expect(runtimeEnv()).toEqual(LOCAL_RUNTIME_ENV);
    window.__DEBUS_ENV__ = { apiUrl: 'https://gw', appEnv: 'production' };
    expect(runtimeEnv().appEnv).toBe('production');
  });
});

it('accepts exactly the environments of the contract', () => {
  for (const appEnv of DEBUS_ENVIRONMENTS) {
    expect(readRuntimeEnv({ APP_ENV: appEnv }).appEnv).toBe(appEnv);
  }
});
