import {
  BACKEND_SERVICES,
  type BackendService,
  type CloudRunLocation,
  type DebusEnv,
  EVENT_TYPES,
  LOCAL_PORTS,
  deadLetterSubscriptionName,
  deadLetterTopicName,
  eventsConsumedBy,
  publisherOf,
  pushServiceAccount,
  serviceAccountEmail,
  serviceUrl,
  subscriptionName,
  topicName,
} from '@debus/contracts';

export const MAX_DELIVERY_ATTEMPTS = 5;

export interface PlanInput {
  env: DebusEnv;
  projectId: string;
  location?: CloudRunLocation;
}

export interface SubscriptionSpec {
  name: string;
  topic: string;
  filter: string;
  pushEndpoint: string;
  oidc?: { serviceAccountEmail: string; audience: string };
  deadLetterTopic?: string;
}

export interface PubSubPlan {
  topics: string[];
  subscriptions: SubscriptionSpec[];
  // reader is the service account of the consumer, the only one allowed to pull its dead-letters.
  deadLetterSubscriptions: { name: string; topic: string; reader: string }[];
}

export function typeFilter(types: readonly string[]): string {
  return types.map((type) => `attributes.type = "${type}"`).join(' OR ');
}

// Pub/Sub caps filters at 256 bytes, so a consumer of every type of a producer gets no filter.
function subscriptionFilter(types: readonly string[], published: readonly string[]): string {
  return types.length === published.length ? '' : typeFilter(types);
}

export function buildPubSubPlan(input: PlanInput): PubSubPlan {
  const { env } = input;
  const cloud = env !== 'local';
  const producers = [...new Set(EVENT_TYPES.map(publisherOf))];
  const subscriptions: SubscriptionSpec[] = [];

  for (const consumer of BACKEND_SERVICES) {
    const consumerUrl = cloud ? serviceUrl(consumer, env, input.location) : localPushHost(consumer);
    for (const producer of producers) {
      const published = EVENT_TYPES.filter((type) => publisherOf(type) === producer);
      const types = eventsConsumedBy(consumer).filter((type) => published.includes(type));
      if (types.length === 0) continue;
      subscriptions.push({
        name: subscriptionName(consumer, producer),
        topic: topicName(producer),
        filter: subscriptionFilter(types, published),
        pushEndpoint: `${consumerUrl}/events/pubsub`,
        ...(cloud && {
          oidc: {
            serviceAccountEmail: pushServiceAccount(input.projectId),
            audience: consumerUrl,
          },
          deadLetterTopic: deadLetterTopicName(consumer),
        }),
      });
    }
  }

  return {
    topics: [
      ...producers.map((producer) => topicName(producer)),
      ...(cloud ? BACKEND_SERVICES.map((consumer) => deadLetterTopicName(consumer)) : []),
    ],
    subscriptions,
    deadLetterSubscriptions: cloud
      ? BACKEND_SERVICES.map((consumer) => ({
          name: deadLetterSubscriptionName(consumer),
          topic: deadLetterTopicName(consumer),
          reader: serviceAccountEmail(consumer, input.projectId),
        }))
      : [],
  };
}

// The emulator runs in Docker, so it reaches the services on the host through host.docker.internal.
function localPushHost(consumer: BackendService): string {
  return `http://host.docker.internal:${LOCAL_PORTS[consumer]}`;
}
