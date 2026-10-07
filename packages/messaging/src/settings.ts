import { DEBUS_ENVIRONMENTS, type DebusEnv, type EventProducer } from '@debus/contracts';
import { z } from 'zod';

export interface MessagingSettings {
  service: EventProducer;
  environment: DebusEnv;
  projectId: string;
  emulator: boolean;
  audience?: string;
  pushServiceAccount?: string;
}

export function loadMessagingSettings(
  service: EventProducer,
  env: Record<string, string | undefined>,
): MessagingSettings {
  const projectId = env.PUBSUB_PROJECT_ID;
  if (!projectId) throw new Error('PUBSUB_PROJECT_ID is required');
  return {
    service,
    environment: z.enum(DEBUS_ENVIRONMENTS).parse(env.DEBUS_ENV ?? 'local'),
    projectId,
    emulator: Boolean(env.PUBSUB_EMULATOR_HOST),
    ...(env.PUBSUB_AUDIENCE && { audience: env.PUBSUB_AUDIENCE }),
    ...(env.PUBSUB_PUSH_SA && { pushServiceAccount: env.PUBSUB_PUSH_SA }),
  };
}
