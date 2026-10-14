import 'reflect-metadata';
import { type EventEnvelope, createEnvelope, exampleTicketSold } from '@debus/contracts';
import { Injectable, type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryInboxStore } from '../inbox/in-memory-inbox-store';
import { OnEvent } from '../inbound/on-event.decorator';
import { decodePushMessage } from '../inbound/push-message';
import { MessagingModule } from '../messaging.module';
import { InMemoryEventBus, pushBody } from './in-memory-event-bus';

@Injectable()
class TicketsHandler {
  readonly seen: unknown[] = [];
  failNext = false;

  @OnEvent('TicketSold')
  sold(payload: unknown): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('database is down');
    }
    this.seen.push(payload);
  }
}

describe('InMemoryEventBus', () => {
  let app: INestApplicationContext;
  let handler: TicketsHandler;
  let bus: InMemoryEventBus;

  beforeAll(async () => {
    process.env.PUBSUB_PROJECT_ID ??= 'debus-unit';
    const moduleRef = await Test.createTestingModule({
      imports: [
        MessagingModule.forRoot({
          service: 'clientes',
          inbox: { useFactory: () => new InMemoryInboxStore() },
        }),
      ],
      providers: [TicketsHandler],
    }).compile();
    app = await moduleRef.init();
    handler = app.get(TicketsHandler);
    bus = InMemoryEventBus.attach(app);
  });

  afterAll(() => app.close());

  it('delivers an event once even if it arrives twice with the same id', async () => {
    const first = await bus.deliver('TicketSold', exampleTicketSold);
    await bus.deliver('TicketSold', exampleTicketSold, { eventId: first.eventId });

    expect(handler.seen).toEqual([exampleTicketSold]);
    expect(first).toMatchObject({ type: 'TicketSold', payload: exampleTicketSold });
  });

  it('lets a failed delivery be retried, as Pub/Sub would', async () => {
    handler.failNext = true;
    const eventId = globalThis.crypto.randomUUID();

    await expect(bus.deliver('TicketSold', exampleTicketSold, { eventId })).rejects.toThrow(
      'database is down',
    );
    await bus.deliver('TicketSold', exampleTicketSold, { eventId, correlationId: 'retry' });

    expect(handler.seen).toHaveLength(2);
  });

  it('captures what is published and filters it by type', async () => {
    const sold = createEnvelope('TicketSold', exampleTicketSold, 'c');
    const probe = createEnvelope('ProbeSent', { requestedAt: new Date().toISOString() }, 'c');

    await expect(bus.publish(sold)).resolves.toEqual(expect.any(String));
    await bus.publish(probe);

    expect(bus.published).toEqual([sold, probe]);
    expect(bus.payloadsOf('TicketSold')).toEqual([exampleTicketSold]);
    bus.clear();
    expect(bus.published).toEqual([]);
  });

  it('works without a module to capture a producer alone', async () => {
    const alone = new InMemoryEventBus();
    await alone.publish(createEnvelope('TicketSold', exampleTicketSold, 'c'));

    expect(alone.payloadsOf('TicketSold')).toHaveLength(1);
    await expect(alone.deliver('TicketSold', exampleTicketSold)).rejects.toThrow(
      'attach the bus to an application to deliver events',
    );
  });
});

describe('pushBody', () => {
  it('encodes an envelope the way Pub/Sub push sends it', () => {
    const envelope: EventEnvelope = createEnvelope('TicketSold', exampleTicketSold, 'c');
    const body = pushBody(envelope, '7');

    expect(decodePushMessage(body)).toEqual(envelope);
    expect(body.message).toMatchObject({ messageId: '7', attributes: { type: 'TicketSold' } });
  });
});
