import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createEnvelope, type EventEnvelope } from '@debus/contracts';
import { PubSub } from '@google-cloud/pubsub';
import { applyPubSubPlan } from '../src/provisioning/apply-pubsub-plan';
import {
  buildPubSubPlan,
  type PubSubPlan,
  type SubscriptionSpec,
} from '../src/provisioning/pubsub-plan';
import { EventPublisher } from '../src/publishing/event-publisher';
import { loadMessagingSettings } from '../src/settings';

// Pub/Sub keeps no history for a topic: a message published while no subscription matches it is
// gone, even though the publish call succeeds (so the outbox marks the event as published). This is
// why the release provisions topics and subscriptions BEFORE it deploys the services.
describe('Event delivery order against the Pub/Sub emulator', () => {
  const projectId = process.env.PUBSUB_PROJECT_ID ?? 'debus-local';
  const suffix = `order-${Date.now()}`;
  const quiet = (): void => undefined;
  const pubsub = new PubSub({ projectId });
  const settings = loadMessagingSettings('administracion', process.env);

  // The real subscription of the first admin's invitation, renamed so parallel suites never share it.
  const real = buildPubSubPlan({ env: 'local', projectId }).subscriptions.find(
    (spec) => spec.name === 'notificaciones-from-administracion',
  ) as SubscriptionSpec;
  const topic = `${real.topic}-${suffix}`;

  const received: string[] = [];
  let receiver: Server;
  let endpoint: string;

  // Delegates to the isolated topic so the publisher under test is the production class.
  const publisher = new EventPublisher(
    { topic: () => pubsub.topic(topic), close: () => pubsub.close() } as unknown as PubSub,
    settings,
  );

  const invitation = (): EventEnvelope =>
    createEnvelope(
      'AccountLinkSent',
      {
        userId: crypto.randomUUID(),
        email: 'first.admin@example.test',
        fullName: 'First Admin',
        reason: 'INVITATION',
        link: 'https://example.test/crear-contrasena?token=t',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      'delivery-order',
    );

  const planWith = (subscriptions: SubscriptionSpec[]): PubSubPlan => ({
    topics: [topic],
    subscriptions,
    deadLetterSubscriptions: [],
  });
  const subscription = (name: string, filter = real.filter): SubscriptionSpec => ({
    ...real,
    name: `${name}-${suffix}`,
    topic,
    filter,
    pushEndpoint: endpoint,
  });

  async function deliveryOf(eventId: string, timeoutMs = 20_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (received.includes(eventId)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  beforeAll(async () => {
    receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          message: { attributes?: { eventId?: string } };
        };
        received.push(body.message.attributes?.eventId ?? '');
        response.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '0.0.0.0', resolve));
    // The emulator runs in Docker and reaches the host through this name.
    endpoint = `http://host.docker.internal:${(receiver.address() as AddressInfo).port}/events/pubsub`;
  });

  // Subscriptions go first: one left behind would stay attached to a deleted topic.
  async function reset(): Promise<void> {
    for (const name of ['main', 'other']) {
      await pubsub.subscription(`${name}-${suffix}`).delete().catch(quiet);
    }
    await pubsub.topic(topic).delete().catch(quiet);
  }

  beforeEach(async () => {
    received.length = 0;
    await reset();
  });

  afterAll(async () => {
    await new Promise((resolve) => receiver.close(resolve));
    await reset();
    await pubsub.close();
  });

  it('loses an event published before its subscription exists, even though the publish succeeds', async () => {
    await applyPubSubPlan(pubsub, planWith([]), quiet);
    const lost = invitation();

    await expect(publisher.publish(lost)).resolves.toEqual(expect.any(String));
    await applyPubSubPlan(pubsub, planWith([subscription('main')]), quiet);
    const canary = invitation();
    await publisher.publish(canary);

    // The canary proves the subscription works: anything published earlier would already be here.
    expect(await deliveryOf(canary.eventId)).toBe(true);
    expect(received).not.toContain(lost.eventId);
  });

  it('loses an event whose type no existing subscription of the topic accepts', async () => {
    const otherTypesOnly = subscription('other', 'attributes.type = "UserRegistered"');
    await applyPubSubPlan(pubsub, planWith([otherTypesOnly]), quiet);
    const lost = invitation();

    await publisher.publish(lost);
    await applyPubSubPlan(pubsub, planWith([otherTypesOnly, subscription('main')]), quiet);
    const canary = invitation();
    await publisher.publish(canary);

    expect(await deliveryOf(canary.eventId)).toBe(true);
    expect(received).not.toContain(lost.eventId);
  });

  it('delivers an event published after the subscriptions were provisioned', async () => {
    await applyPubSubPlan(pubsub, planWith([subscription('main')]), quiet);
    const event = invitation();

    await publisher.publish(event);

    expect(await deliveryOf(event.eventId)).toBe(true);
  });
});
