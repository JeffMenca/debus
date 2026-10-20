import type { DebusEnv } from '@debus/contracts';

// Typed against the contract but not imported from it: the package carries zod, and the first
// screen of the site must not.
const ENVIRONMENTS = ['local', 'production'] as const satisfies readonly DebusEnv[];

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
  production: 'Producción',
};

export function readRuntimeEnv(source: Record<string, string | undefined>): RuntimeEnv {
  return {
    apiUrl: (source.API_URL ?? LOCAL_RUNTIME_ENV.apiUrl).replace(/\/$/, ''),
    appEnv: ENVIRONMENTS.find((env) => env === source.APP_ENV) ?? LOCAL_RUNTIME_ENV.appEnv,
  };
}

// Set by /env.js at runtime so the image holds no environment-specific values.
export function runtimeEnv(): RuntimeEnv {
  return (typeof window === 'undefined' ? undefined : window.__DEBUS_ENV__) ?? LOCAL_RUNTIME_ENV;
}
