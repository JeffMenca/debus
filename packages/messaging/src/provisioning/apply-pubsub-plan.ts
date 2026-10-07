import { type CreateSubscriptionOptions, PubSub } from '@google-cloud/pubsub';
import {
  MAX_DELIVERY_ATTEMPTS,
  type PlanInput,
  type PubSubPlan,
  type SubscriptionSpec,
  buildPubSubPlan,
} from './pubsub-plan';

type Log = (message: string) => void;
const DEAD_LETTER_RETENTION_SECONDS = 7 * 24 * 60 * 60;

// Idempotent: creates what is missing, updates push and retry settings, and recreates a
// subscription whose filter changed (Pub/Sub filters are immutable).
export async function applyPubSubPlan(
  pubsub: PubSub,
  plan: PubSubPlan,
  log: Log = console.log,
): Promise<void> {
  for (const name of plan.topics) {
    const [exists] = await pubsub.topic(name).exists();
    if (!exists) {
      await pubsub.createTopic(name);
      log(`topic ${name} created`);
    }
  }
  for (const spec of plan.subscriptions) await upsertPushSubscription(pubsub, spec, log);
  for (const { name, topic } of plan.deadLetterSubscriptions) {
    const [exists] = await pubsub.subscription(name).exists();
    if (!exists) {
      await pubsub.topic(topic).createSubscription(name, {
        messageRetentionDuration: { seconds: DEAD_LETTER_RETENTION_SECONDS },
      });
      log(`dead-letter subscription ${name} created`);
    }
  }
}

async function upsertPushSubscription(
  pubsub: PubSub,
  spec: SubscriptionSpec,
  log: Log,
): Promise<void> {
  const settings = mutableSettings(pubsub, spec);
  const subscription = pubsub.subscription(spec.name);
  const [exists] = await subscription.exists();
  if (exists) {
    const [metadata] = await subscription.getMetadata();
    if ((metadata.filter ?? '') === spec.filter) {
      await subscription.setMetadata(settings);
      log(`subscription ${spec.name} updated`);
      return;
    }
    await subscription.delete();
    log(`subscription ${spec.name} recreated because its filter changed`);
  }
  await pubsub
    .topic(spec.topic)
    .createSubscription(spec.name, { ...settings, ...(spec.filter && { filter: spec.filter }) });
  log(`subscription ${spec.name} created`);
}

function mutableSettings(pubsub: PubSub, spec: SubscriptionSpec): CreateSubscriptionOptions {
  return {
    ackDeadlineSeconds: 60,
    pushConfig: { pushEndpoint: spec.pushEndpoint, ...(spec.oidc && { oidcToken: spec.oidc }) },
    ...(spec.deadLetterTopic && {
      deadLetterPolicy: {
        deadLetterTopic: pubsub.topic(spec.deadLetterTopic).name,
        maxDeliveryAttempts: MAX_DELIVERY_ATTEMPTS,
      },
      retryPolicy: { minimumBackoff: { seconds: 10 }, maximumBackoff: { seconds: 600 } },
    }),
  };
}

export async function provisionPubSub(input: PlanInput, log: Log = console.log): Promise<void> {
  const pubsub = new PubSub({ projectId: input.projectId });
  try {
    await applyPubSubPlan(pubsub, buildPubSubPlan(input), log);
  } finally {
    await pubsub.close();
  }
}
