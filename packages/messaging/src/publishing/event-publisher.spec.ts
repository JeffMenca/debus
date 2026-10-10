import { createEnvelope } from '@debus/contracts';
import type { PubSub } from '@google-cloud/pubsub';
import type { MessagingSettings } from '../settings';
import { EventPublisher } from './event-publisher';

const settings: MessagingSettings = {
  service: 'gateway',
  environment: 'production',
  projectId: 'p',
  emulator: false,
};

function fakePubSub() {
  const publishMessage = jest.fn().mockResolvedValue('message-1');
  const topic = jest.fn().mockReturnValue({ publishMessage });
  return { pubsub: { topic } as unknown as PubSub, topic, publishMessage };
}

describe('EventPublisher', () => {
  it('publishes to the producer topic with routing attributes', async () => {
    const { pubsub, topic, publishMessage } = fakePubSub();
    const envelope = createEnvelope('ProbeSent', {}, 'c-1');

    const id = await new EventPublisher(pubsub, settings).publish(envelope);

    expect(id).toBe('message-1');
    expect(topic).toHaveBeenCalledWith('gateway-events');
    expect(publishMessage).toHaveBeenCalledWith({
      json: envelope,
      attributes: { type: 'ProbeSent', eventId: envelope.eventId, correlationId: 'c-1' },
    });
  });

  it('refuses to publish events owned by another service', async () => {
    const { pubsub } = fakePubSub();

    await expect(
      new EventPublisher(pubsub, settings).publish(createEnvelope('TripScheduled', {}, 'c')),
    ).rejects.toThrow('gateway cannot publish TripScheduled');
  });

  it('closes the Pub/Sub client when the application shuts down, so no call outlives it', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const publisher = new EventPublisher({ close } as unknown as PubSub, settings);

    await publisher.onApplicationShutdown();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
