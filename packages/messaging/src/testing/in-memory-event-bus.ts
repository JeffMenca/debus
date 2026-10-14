import { type EventEnvelope, type EventType, createEnvelope } from '@debus/contracts';
import type { INestApplicationContext } from '@nestjs/common';
import { InboundEvents } from '../inbound/inbound-events';

export interface PushBody {
  message: { data: string; messageId: string; attributes: Record<string, string> };
  subscription: string;
}

// The body Pub/Sub push posts to /events/pubsub for this envelope.
export function pushBody(envelope: EventEnvelope, messageId = '1'): PushBody {
  return {
    message: {
      data: Buffer.from(JSON.stringify(envelope)).toString('base64'),
      messageId,
      attributes: { type: envelope.type, eventId: envelope.eventId },
    },
    subscription: 'in-memory',
  };
}

export interface DeliverOptions {
  eventId?: string;
  correlationId?: string;
}

/**
 * Pub/Sub for tests. `deliver` runs an event through the real inbox and handlers of an attached
 * application; `publish` has the EventPublisher signature, so overriding that provider with the bus
 * captures what a service publishes.
 */
export class InMemoryEventBus {
  readonly published: EventEnvelope[] = [];

  constructor(private readonly inbound?: Pick<InboundEvents, 'receive'>) {}

  static attach(app: INestApplicationContext): InMemoryEventBus {
    return new InMemoryEventBus(app.get(InboundEvents));
  }

  async publish(envelope: EventEnvelope): Promise<string> {
    this.published.push(envelope);
    return String(this.published.length);
  }

  async deliver(
    type: EventType,
    payload: unknown,
    options: DeliverOptions = {},
  ): Promise<EventEnvelope> {
    if (!this.inbound) throw new Error('attach the bus to an application to deliver events');
    const envelope = createEnvelope(type, payload, options.correlationId ?? 'in-memory');
    if (options.eventId) envelope.eventId = options.eventId;
    await this.inbound.receive(pushBody(envelope));
    return envelope;
  }

  payloadsOf(type: EventType): unknown[] {
    return this.published.filter((envelope) => envelope.type === type).map((e) => e.payload);
  }

  clear(): void {
    this.published.length = 0;
  }
}
