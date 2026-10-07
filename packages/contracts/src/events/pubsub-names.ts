import { type BackendService, type DebusEnv, resourceName } from '../topology';
import type { EventProducer } from './registry';

export const topicName = (producer: EventProducer, env: DebusEnv): string =>
  resourceName(`${producer}-events`, env);

export const subscriptionName = (
  consumer: BackendService,
  producer: EventProducer,
  env: DebusEnv,
): string => resourceName(`${consumer}-from-${producer}`, env);

export const deadLetterTopicName = (consumer: BackendService, env: DebusEnv): string =>
  resourceName(`${consumer}-dlq`, env);

export const deadLetterSubscriptionName = (consumer: BackendService, env: DebusEnv): string =>
  resourceName(`${consumer}-dlq-sub`, env);
