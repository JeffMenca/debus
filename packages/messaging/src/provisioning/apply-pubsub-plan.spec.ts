import type { PubSub } from '@google-cloud/pubsub';
import { applyPubSubPlan } from './apply-pubsub-plan';
import type { PubSubPlan } from './pubsub-plan';

function fakePubSub(existing: Record<string, { filter?: string }>) {
  const created: string[] = [];
  const createSubscription = jest.fn((name: string) => {
    created.push(name);
    return Promise.resolve();
  });
  const setMetadata = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const pubsub = {
    topic: (name: string) => ({
      name: `projects/p/topics/${name}`,
      exists: () => Promise.resolve([name in existing]),
      createSubscription,
    }),
    createTopic: jest.fn((name: string) => {
      created.push(name);
      return Promise.resolve();
    }),
    subscription: (name: string) => ({
      exists: () => Promise.resolve([name in existing]),
      getMetadata: () => Promise.resolve([existing[name]]),
      setMetadata,
      delete: remove,
    }),
  } as unknown as PubSub;
  return { pubsub, created, createSubscription, setMetadata, remove };
}

const plan: PubSubPlan = {
  topics: ['viajes-events', 'ventas-dlq'],
  subscriptions: [
    {
      name: 'ventas-from-viajes',
      topic: 'viajes-events',
      filter: 'attributes.type = "ViajeProgramado"',
      pushEndpoint: 'https://ventas/events/pubsub',
      oidc: { serviceAccountEmail: 'sa@p', audience: 'https://ventas' },
      deadLetterTopic: 'ventas-dlq',
    },
  ],
  deadLetterSubscriptions: [{ name: 'ventas-dlq-sub', topic: 'ventas-dlq' }],
};

describe('applyPubSubPlan', () => {
  it('creates missing topics and subscriptions with dead-letter and retry policies', async () => {
    const { pubsub, created, createSubscription } = fakePubSub({});

    await applyPubSubPlan(pubsub, plan, () => undefined);

    expect(created).toEqual([
      'viajes-events',
      'ventas-dlq',
      'ventas-from-viajes',
      'ventas-dlq-sub',
    ]);
    expect(createSubscription).toHaveBeenCalledWith('ventas-from-viajes', {
      filter: 'attributes.type = "ViajeProgramado"',
      ackDeadlineSeconds: 60,
      pushConfig: {
        pushEndpoint: 'https://ventas/events/pubsub',
        oidcToken: { serviceAccountEmail: 'sa@p', audience: 'https://ventas' },
      },
      deadLetterPolicy: { deadLetterTopic: 'projects/p/topics/ventas-dlq', maxDeliveryAttempts: 5 },
      retryPolicy: { minimumBackoff: { seconds: 10 }, maximumBackoff: { seconds: 600 } },
    });
  });

  it('updates existing subscriptions in place when the filter is unchanged', async () => {
    const { pubsub, created, setMetadata, remove } = fakePubSub({
      'viajes-events': {},
      'ventas-dlq': {},
      'ventas-from-viajes': { filter: 'attributes.type = "ViajeProgramado"' },
      'ventas-dlq-sub': {},
    });

    await applyPubSubPlan(pubsub, plan, () => undefined);

    expect(created).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
    expect(setMetadata).toHaveBeenCalledWith(
      expect.not.objectContaining({ filter: expect.anything() }),
    );
  });

  it('recreates a subscription whose filter changed', async () => {
    const { pubsub, created, remove } = fakePubSub({
      'viajes-events': {},
      'ventas-dlq': {},
      'ventas-from-viajes': { filter: 'attributes.type = "Otro"' },
      'ventas-dlq-sub': {},
    });

    await applyPubSubPlan(pubsub, plan, () => undefined);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(created).toEqual(['ventas-from-viajes']);
  });
});
