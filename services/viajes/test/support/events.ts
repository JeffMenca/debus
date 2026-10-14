import type { EventEnvelope, EventType } from '@debus/contracts';
import { Outbox } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/prisma/prisma.service';

// A delivered event loses its payload in the outbox table (links and tokens must not stay), and the
// request path flushes right away. So the payload is read at the moment the service writes it, and
// the row is then looked up by id to prove it was committed with the transaction.
export function captureEvents(app: INestApplication, prisma: PrismaService) {
  const outbox = app.get(Outbox);
  const written: EventEnvelope[] = [];
  const add = outbox.add.bind(outbox);
  jest.spyOn(outbox, 'add').mockImplementation(async (tx, type, payload, correlationId) => {
    const envelope = await add(tx, type, payload, correlationId);
    written.push(envelope);
    return envelope;
  });

  return {
    // The types of the events committed for a trip, in the order they were written.
    async typesFor(tripId: string): Promise<EventType[]> {
      const types: EventType[] = [];
      for (const envelope of written) {
        if ((envelope.payload as { tripId?: string }).tripId !== tripId) continue;
        const row = await prisma.outboxEvent.findUnique({ where: { eventId: envelope.eventId } });
        if (row) types.push(envelope.type);
      }
      return types;
    },

    // The payloads of the committed events of a type, oldest first.
    async committed<T = unknown>(type: EventType): Promise<T[]> {
      const payloads: T[] = [];
      for (const envelope of written.filter((event) => event.type === type)) {
        const row = await prisma.outboxEvent.findUnique({ where: { eventId: envelope.eventId } });
        if (row) payloads.push(envelope.payload as T);
      }
      return payloads;
    },
  };
}
