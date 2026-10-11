import 'reflect-metadata';
import { createEnvelope, eventEnvelopeSchema } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import { EventPublisher } from '../src/publishing/event-publisher';
import { loadMessagingSettings } from '../src/settings';
import { pullOne } from './support/pull';

describe('EventPublisher against the Pub/Sub emulator', () => {
  const settings = loadMessagingSettings('gateway', process.env);
  const pubsub = new PubSub({ projectId: settings.projectId });
  const subscriptionName = `publisher-test-${Date.now()}`;

  beforeAll(async () => {
    const [exists] = await pubsub.topic('gateway-events').exists();
    if (!exists) await pubsub.createTopic('gateway-events');
    await pubsub.topic('gateway-events').createSubscription(subscriptionName);
  });

  afterAll(async () => {
    await pubsub.subscription(subscriptionName).delete();
    await pubsub.close();
  });

  it('delivers the envelope with its attributes', async () => {
    const envelope = createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, 'c-1');

    await new EventPublisher(pubsub, settings).publish(envelope);

    const message = await pullOne(subscriptionName);
    expect(eventEnvelopeSchema.parse(JSON.parse(message.data))).toEqual(envelope);
    expect(message.attributes).toMatchObject({ type: 'ProbeSent', eventId: envelope.eventId });
  });
});
