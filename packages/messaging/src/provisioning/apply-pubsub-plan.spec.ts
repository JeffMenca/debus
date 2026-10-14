import type { PubSub } from '@google-cloud/pubsub';
import { applyPubSubPlan } from './apply-pubsub-plan';
import type { PubSubPlan } from './pubsub-plan';

type Binding = { role: string; members: string[] };

function fakePubSub(existing: Record<string, { filter?: string }>, bindings: Binding[] = []) {
  const created: string[] = [];
  const getPolicy = jest.fn().mockResolvedValue([{ bindings, etag: 'e1' }]);
  const setPolicy = jest.fn().mockResolvedValue([{}]);
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
      iam: { getPolicy, setPolicy },
    }),
  } as unknown as PubSub;
  return { pubsub, created, createSubscription, setMetadata, remove, setPolicy };
}

const plan: PubSubPlan = {
  topics: ['viajes-events', 'ventas-dlq'],
  subscriptions: [
    {
      name: 'ventas-from-viajes',
      topic: 'viajes-events',
      filter: 'attributes.type = "TripScheduled"',
      pushEndpoint: 'https://ventas/events/pubsub',
      oidc: { serviceAccountEmail: 'sa@p', audience: 'https://ventas' },
      deadLetterTopic: 'ventas-dlq',
    },
  ],
  deadLetterSubscriptions: [
    {
      name: 'ventas-dlq-sub',
      topic: 'ventas-dlq',
      reader: 'debus-ventas@p.iam.gserviceaccount.com',
    },
  ],
};
const SUBSCRIBER = 'roles/pubsub.subscriber';
const READER = 'serviceAccount:debus-ventas@p.iam.gserviceaccount.com';

describe('applyPubSubPlan', () => {
  it('lets each service read its own dead-letter subscription', async () => {
    const others = { role: SUBSCRIBER, members: ['user:ops@debus.test'] };
    const { pubsub, setPolicy } = fakePubSub({}, [others]);
    const log = jest.fn();

    await applyPubSubPlan(pubsub, plan, log);

    expect(setPolicy).toHaveBeenCalledWith({
      bindings: [{ role: SUBSCRIBER, members: ['user:ops@debus.test', READER] }],
      etag: 'e1',
    });
    expect(log).toHaveBeenCalledWith(
      'ventas-dlq-sub readable by debus-ventas@p.iam.gserviceaccount.com',
    );
  });

  it('adds the subscriber binding when there is none and never twice', async () => {
    const empty = fakePubSub({});
    await applyPubSubPlan(empty.pubsub, plan, () => undefined);
    expect(empty.setPolicy).toHaveBeenCalledWith({
      bindings: [{ role: SUBSCRIBER, members: [READER] }],
      etag: 'e1',
    });

    const granted = fakePubSub({}, [{ role: SUBSCRIBER, members: [READER] }]);
    await applyPubSubPlan(granted.pubsub, plan, () => undefined);
    expect(granted.setPolicy).not.toHaveBeenCalled();
  });

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
      filter: 'attributes.type = "TripScheduled"',
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
      'ventas-from-viajes': { filter: 'attributes.type = "TripScheduled"' },
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
