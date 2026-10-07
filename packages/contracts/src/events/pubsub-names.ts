import type { BackendService } from '../topology';
import type { EventProducer } from './registry';

export const topicName = (producer: EventProducer): string => `${producer}-events`;

export const subscriptionName = (consumer: BackendService, producer: EventProducer): string =>
  `${consumer}-from-${producer}`;

export const deadLetterTopicName = (consumer: BackendService): string => `${consumer}-dlq`;

export const deadLetterSubscriptionName = (consumer: BackendService): string =>
  `${consumer}-dlq-sub`;
