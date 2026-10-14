import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  IDENTITY_HEADERS,
  createEnvelope,
  deadLetterTopicName,
  deadLetterSubscriptionName,
  exampleTicketSold,
} from '@debus/contracts';
import { RolesGuard } from '@debus/server';
import { PubSub } from '@google-cloud/pubsub';
import { type INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryInboxStore, MessagingModule, OnEvent } from '../src';

@Injectable()
class TicketsHandler {
  readonly seen: unknown[] = [];

  @OnEvent('TicketSold')
  sold(payload: unknown): void {
    this.seen.push(payload);
  }
}

const as = (role: string) => ({
  [IDENTITY_HEADERS.userId]: randomUUID(),
  [IDENTITY_HEADERS.role]: role,
});
const admin = as('SYSTEM_ADMIN');

describe('dead-letters of a consumer', () => {
  // The emulator keeps what a test creates, so the queue lives in a project of its own, emptied
  // when the file ends.
  const projectId = `debus-dead-letters-${randomUUID().slice(0, 8)}`;
  const previousProject = process.env.PUBSUB_PROJECT_ID;
  const pubsub = new PubSub({ projectId });
  const topic = pubsub.topic(deadLetterTopicName('clientes'));
  const subscription = pubsub.subscription(deadLetterSubscriptionName('clientes'));
  let app: INestApplication;
  let handler: TicketsHandler;

  const list = async (expected: number) => {
    // A released message comes back to the subscription after a moment.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await request(app.getHttpServer()).get('/dead-letters').set(admin);
      expect(response.status).toBe(200);
      if (response.body.items.length === expected) return response.body;
    }
    throw new Error(`the queue never had ${expected} messages`);
  };

  const deadLetter = (data: string) =>
    topic.publishMessage({
      data: Buffer.from(data),
      attributes: { CloudPubSubDeadLetterSourceDeliveryCount: '5' },
    });

  beforeAll(async () => {
    process.env.PUBSUB_PROJECT_ID = projectId;
    await pubsub.createTopic(topic.name);
    await topic.createSubscription(subscription.name);
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({
          service: 'clientes',
          inbox: { useFactory: () => new InMemoryInboxStore() },
        }),
      ],
      providers: [TicketsHandler, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    handler = app.get(TicketsHandler);
  });

  afterAll(async () => {
    process.env.PUBSUB_PROJECT_ID = previousProject;
    await app.close();
    try {
      await subscription.delete().catch(() => undefined);
      await topic.delete();
      expect((await pubsub.getTopics())[0]).toHaveLength(0);
    } finally {
      await pubsub.close();
    }
  });

  it('is only for the system admin', async () => {
    const server = app.getHttpServer();
    await request(server).get('/dead-letters').set(as('CLIENT')).expect(403);
    await request(server).get('/dead-letters').expect(401);
    await request(server).get('/dead-letters?limit=0').set(admin).expect(400);
  });

  it('shows a failed event, replays it through the inbox and removes it', async () => {
    const envelope = createEnvelope('TicketSold', exampleTicketSold, 'dlq-test');
    await deadLetter(JSON.stringify(envelope));

    const { items, hasMore } = await list(1);
    expect(hasMore).toBe(false);
    expect(items[0]).toMatchObject({
      eventId: envelope.eventId,
      type: 'TicketSold',
      deliveryAttempts: 5,
      payload: exampleTicketSold,
    });

    await request(app.getHttpServer())
      .post(`/dead-letters/${items[0].messageId}/replay`)
      .set(admin)
      .expect(200, { outcome: 'processed' });

    expect(handler.seen).toEqual([exampleTicketSold]);
    await list(0);
  });

  it('discards a message that is not an event and answers 404 once it is gone', async () => {
    await deadLetter('not json');
    const { items } = await list(1);
    expect(items[0]).toMatchObject({ type: null, payload: 'not json' });
    const server = app.getHttpServer();

    await request(server).delete(`/dead-letters/${items[0].messageId}`).set(admin).expect(204);
    await request(server).delete(`/dead-letters/${items[0].messageId}`).set(admin).expect(404);
    await list(0);
  });

  it('reads an empty list where the queue does not exist, as on a laptop', async () => {
    await subscription.delete();

    await expect(list(0)).resolves.toEqual({ items: [], hasMore: false });
  });
});
