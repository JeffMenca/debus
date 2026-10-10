import {
  BACKEND_SERVICES,
  type BackendService,
  DEBUS_ENVIRONMENTS,
  type DebusEnv,
  serviceUrlVariable,
} from '@debus/contracts';
import { z } from 'zod';

export abstract class GatewayConfig {
  abstract readonly environment: DebusEnv;
  abstract readonly serviceAuth: 'google' | 'none';
  abstract readonly jwtPublicKey: string;
  abstract readonly corsOrigins: readonly string[];
  abstract readonly serviceUrls: Readonly<Record<BackendService, string>>;
}

export function loadGatewayConfig(env: Record<string, string | undefined>): GatewayConfig {
  const serviceUrls = Object.fromEntries(
    BACKEND_SERVICES.map((service) => {
      const variable = serviceUrlVariable(service);
      const url = env[variable];
      if (!url) throw new Error(`${variable} is required`);
      return [service, url.replace(/\/$/, '')];
    }),
  ) as Record<BackendService, string>;

  const jwtPublicKey = env.JWT_PUBLIC_KEY;
  if (!jwtPublicKey) throw new Error('JWT_PUBLIC_KEY is required');

  return {
    environment: z.enum(DEBUS_ENVIRONMENTS).parse(env.DEBUS_ENV ?? 'local'),
    serviceAuth: z.enum(['google', 'none']).parse(env.SERVICE_AUTH ?? 'none'),
    // Cloud Run receives the PEM as one line with literal \n sequences.
    jwtPublicKey: jwtPublicKey.replace(/\\n/g, '\n'),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    serviceUrls,
  };
}
