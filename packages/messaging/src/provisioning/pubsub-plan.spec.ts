import { buildPubSubPlan } from './pubsub-plan';

const location = { projectNumber: '123', region: 'us-central1' };

describe('buildPubSubPlan', () => {
  it('creates one topic per producer and one dead-letter per consumer in the cloud', () => {
    const plan = buildPubSubPlan({ env: 'production', projectId: 'p', location });

    expect(plan.topics).toEqual(
      expect.arrayContaining(['gateway-events', 'viajes-events', 'ventas-dlq']),
    );
    expect(plan.deadLetterSubscriptions).toContainEqual({
      name: 'ventas-dlq-sub',
      topic: 'ventas-dlq',
    });
  });

  it('filters each push subscription to the types the consumer listens to', () => {
    const plan = buildPubSubPlan({ env: 'production', projectId: 'p', location });
    const reportsFromFleet = plan.subscriptions.find((s) => s.name === 'reportes-from-flota');

    expect(reportsFromFleet).toEqual({
      name: 'reportes-from-flota',
      topic: 'flota-events',
      filter:
        'attributes.type = "BusAdded" OR attributes.type = "BusUpdated" OR attributes.type = "BusDeactivated" OR attributes.type = "RouteCreated" OR attributes.type = "RouteUpdated" OR attributes.type = "RouteDeleted"',
      pushEndpoint: 'https://reportes-123.us-central1.run.app/events/pubsub',
      oidc: {
        serviceAccountEmail: 'pubsub-invoker@p.iam.gserviceaccount.com',
        audience: 'https://reportes-123.us-central1.run.app',
      },
      deadLetterTopic: 'reportes-dlq',
    });
  });

  it('lets flota follow the trips and administracion the buses and drivers', () => {
    const plan = buildPubSubPlan({ env: 'production', projectId: 'p', location });
    const names = plan.subscriptions.map((s) => s.name);

    expect(names).toEqual(
      expect.arrayContaining(['flota-from-viajes', 'administracion-from-flota']),
    );
    // flota listens to every trip event, so its subscription needs no filter.
    expect(plan.subscriptions.find((s) => s.name === 'flota-from-viajes')?.filter).toBe('');
    expect(plan.subscriptions.find((s) => s.name === 'administracion-from-flota')?.filter).toBe(
      ['BusAdded', 'BusUpdated', 'BusDeactivated', 'DriverAdded', 'DriverUpdated']
        .map((type) => `attributes.type = "${type}"`)
        .join(' OR '),
    );
  });

  it('subscribes every backend service to the probe', () => {
    const plan = buildPubSubPlan({ env: 'local', projectId: 'debus-local' });

    expect(plan.subscriptions.filter((s) => s.topic === 'gateway-events')).toHaveLength(7);
  });

  it('pushes to the host without OIDC or dead-letters in local', () => {
    const plan = buildPubSubPlan({ env: 'local', projectId: 'debus-local' });

    expect(plan.subscriptions.find((s) => s.name === 'flota-from-gateway')).toEqual({
      name: 'flota-from-gateway',
      topic: 'gateway-events',
      filter: '',
      pushEndpoint: 'http://host.docker.internal:4002/events/pubsub',
    });
    expect(plan.deadLetterSubscriptions).toEqual([]);
  });

  it('skips the filter when the consumer takes every type of the producer', () => {
    const plan = buildPubSubPlan({ env: 'local', projectId: 'debus-local' });

    expect(plan.subscriptions.find((s) => s.name === 'viajes-from-flota')?.filter).toBe('');
  });

  it('keeps every filter within the 256-byte Pub/Sub limit', () => {
    const plan = buildPubSubPlan({ env: 'production', projectId: 'p', location });

    for (const { filter } of plan.subscriptions) {
      expect(Buffer.byteLength(filter)).toBeLessThanOrEqual(256);
    }
  });
});
