import { randomUUID } from 'node:crypto';
import { topicName } from '@debus/contracts';
import { PubSub, type Message } from '@google-cloud/pubsub';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { activeAccount } from './support/accounts';
import { createTestApp } from './support/app';
import { cleanTestData } from './support/cleanup';
import { type EventCapture, captureEvents } from './support/events';
import { identityHeaders } from './support/identity';

// The services running on this machine listen to the local project; what the tests publish must
// never reach them (it would leave test rates in the copies of viajes, long after the cleanup).
const LOCAL_PROJECT = 'debus-local';

describe('pub/sub isolation of the integration tests', () => {
  let app: INestApplication;
  let events: EventCapture;
  let local: PubSub;

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
    local = new PubSub({ projectId: LOCAL_PROJECT });
  });

  afterAll(async () => {
    try {
      await cleanTestData(app.get(PrismaService));
      await app?.close();
    } finally {
      await local?.close().catch(() => undefined);
      await events?.close();
    }
  });

  it('publishes to a project of its own, not to the one the local services read', async () => {
    expect(process.env.PUBSUB_PROJECT_ID).not.toBe(LOCAL_PROJECT);

    const topic = local.topic(topicName('administracion'));
    if (!(await topic.exists())[0]) await topic.create();
    const [subscription] = await topic.createSubscription(`isolation-${randomUUID()}`);
    const delivered: string[] = [];
    subscription.on('message', (message: Message) => {
      delivered.push(message.data.toString());
      message.ack();
    });
    try {
      const admin = await activeAccount(app, events, { role: 'SYSTEM_ADMIN' });
      const created = await request(app.getHttpServer())
        .post('/settings')
        .set(identityHeaders(admin.id, 'SYSTEM_ADMIN'))
        .send({ depreciationPerKm: 1.1, rentalRatePerKm: 11, effectiveFrom: '2099-01-01' })
        .expect(201);
      await events.next(
        'SettingsUpdated',
        (payload: { versionId: string }) => payload.versionId === created.body.id,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      expect(delivered.filter((data) => data.includes(created.body.id))).toEqual([]);
    } finally {
      await subscription.close().catch(() => undefined);
      await subscription.delete().catch(() => undefined);
    }
  });

  it('has no push subscription in the test project that points at a service on this machine', async () => {
    const test = new PubSub({ projectId: process.env.PUBSUB_PROJECT_ID });
    try {
      const [subscriptions] = await test.getSubscriptions();
      const endpoints = await Promise.all(
        subscriptions.map(async (subscription) => {
          const [metadata] = await subscription.getMetadata();
          return { name: subscription.name, endpoint: metadata.pushConfig?.pushEndpoint ?? '' };
        }),
      );

      // A pull subscription has no endpoint. Anything pushed to the ports of the local services
      // (400x, through localhost or host.docker.internal) would deliver test events to them.
      expect(endpoints.filter(({ endpoint }) => /:400\d(\/|$)/.test(endpoint))).toEqual([]);
    } finally {
      await test.close().catch(() => undefined);
    }
  });
});
