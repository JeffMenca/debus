import { DEBUS_ENVIRONMENTS, type DebusEnv } from '@debus/contracts';

export interface RuntimeEnv {
  apiUrl: string;
  appEnv: DebusEnv;
}

declare global {
  interface Window {
    __DEBUS_ENV__?: RuntimeEnv;
  }
}

export const LOCAL_RUNTIME_ENV: RuntimeEnv = { apiUrl: 'http://localhost:4000', appEnv: 'local' };

export const ENVIRONMENT_LABELS: Record<DebusEnv, string> = {
  local: 'Local',
  staging: 'Pruebas',
  production: 'Producción',
};

export function readRuntimeEnv(source: Record<string, string | undefined>): RuntimeEnv {
  return {
    apiUrl: (source.API_URL ?? LOCAL_RUNTIME_ENV.apiUrl).replace(/\/$/, ''),
    appEnv: DEBUS_ENVIRONMENTS.find((env) => env === source.APP_ENV) ?? LOCAL_RUNTIME_ENV.appEnv,
  };
}

// Set by /env.js at runtime so one image serves staging and production.
export function runtimeEnv(): RuntimeEnv {
  return (typeof window === 'undefined' ? undefined : window.__DEBUS_ENV__) ?? LOCAL_RUNTIME_ENV;
}
