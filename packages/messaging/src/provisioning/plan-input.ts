import { DEBUS_ENVIRONMENTS } from '@debus/contracts';
import { z } from 'zod';
import type { PlanInput } from './pubsub-plan';

export function planInputFromEnv(env: Record<string, string | undefined>): PlanInput {
  const target = z.enum(DEBUS_ENVIRONMENTS).parse(env.DEBUS_ENV ?? 'local');
  const projectId = env.PUBSUB_PROJECT_ID ?? 'debus-local';
  if (target === 'local') return { env: target, projectId };
  if (!env.GCP_PROJECT_NUMBER || !env.GCP_REGION) {
    throw new Error('GCP_PROJECT_NUMBER and GCP_REGION are required');
  }
  return {
    env: target,
    projectId,
    location: { projectNumber: env.GCP_PROJECT_NUMBER, region: env.GCP_REGION },
  };
}
