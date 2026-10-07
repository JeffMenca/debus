import {
  deadLetterSubscriptionName,
  deadLetterTopicName,
  subscriptionName,
  topicName,
} from './pubsub-names';

describe('Pub/Sub names', () => {
  it('builds plain resource names', () => {
    expect(topicName('viajes')).toBe('viajes-events');
    expect(subscriptionName('ventas', 'viajes')).toBe('ventas-from-viajes');
    expect(deadLetterTopicName('ventas')).toBe('ventas-dlq');
    expect(deadLetterSubscriptionName('ventas')).toBe('ventas-dlq-sub');
  });
});
