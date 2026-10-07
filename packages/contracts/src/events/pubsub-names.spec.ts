import {
  deadLetterSubscriptionName,
  deadLetterTopicName,
  subscriptionName,
  topicName,
} from './pubsub-names';

describe('Pub/Sub names', () => {
  it('suffixes every resource in staging', () => {
    expect(topicName('viajes', 'staging')).toBe('viajes-events-staging');
    expect(subscriptionName('ventas', 'viajes', 'staging')).toBe('ventas-from-viajes-staging');
    expect(deadLetterTopicName('ventas', 'staging')).toBe('ventas-dlq-staging');
    expect(deadLetterSubscriptionName('ventas', 'staging')).toBe('ventas-dlq-sub-staging');
  });

  it('uses plain names in production and local', () => {
    expect(topicName('gateway', 'production')).toBe('gateway-events');
    expect(subscriptionName('flota', 'gateway', 'local')).toBe('flota-from-gateway');
  });
});
