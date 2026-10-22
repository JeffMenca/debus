import {
  type EventEnvelope,
  type SaleChannel,
  type TicketSoldPayload,
  ticketSoldPayloadSchema,
  tripDeletedPayloadSchema,
} from '@debus/contracts';
import { OnEvent, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { emailKeys } from '../mail/email-keys';
import { EmailQueue, type QueuedEmail } from '../mail/email-queue';
import { PrismaService } from '../prisma/prisma.service';
import { inTransaction } from '../prisma/transaction';
import { type TicketNotice, ticketSoldEmail, tripCancelledEmail } from './ticket-emails';

type TicketWithEmail = TicketSoldPayload & { email: string };

const cancellation = (eventId: string, ticketId: string, notice: TicketNotice): QueuedEmail => ({
  eventId,
  dedupeKey: emailKeys.tripCancelled(ticketId),
  template: 'TRIP_CANCELLED',
  message: tripCancelledEmail(notice),
});

@Injectable()
export class TicketsHandler {
  constructor(
    private readonly queue: EmailQueue,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('TicketSold')
  async sold(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const ticket = ticketSoldPayloadSchema.parse(payload);
    if (!ticket.email) return;
    const withEmail: TicketWithEmail = { ...ticket, email: ticket.email };
    const db = inTransaction(tx, this.prisma);
    await this.lockTrip(db, ticket.tripId);
    if (await db.cancelledTrip.findUnique({ where: { tripId: ticket.tripId } })) {
      await this.queue.enqueue(tx, [cancellation(envelope.eventId, ticket.ticketId, withEmail)]);
      return;
    }
    await db.ticketCopy.createMany({
      data: [
        {
          ticketId: ticket.ticketId,
          tripId: ticket.tripId,
          email: ticket.email,
          buyerName: ticket.buyerName,
          channel: ticket.channel,
          originLabel: ticket.originLabel,
          destinationLabel: ticket.destinationLabel,
          departureAt: new Date(ticket.departureAt),
          seats: ticket.seats,
          total: ticket.total,
        },
      ],
      skipDuplicates: true,
    });
    await this.queue.enqueue(tx, [
      {
        eventId: envelope.eventId,
        dedupeKey: emailKeys.ticketSold(ticket.ticketId),
        template: 'TICKET_SOLD',
        message: ticketSoldEmail(withEmail),
      },
    ]);
  }

  @OnEvent('TripDeleted')
  async tripDeleted(payload: unknown, envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const { tripId } = tripDeletedPayloadSchema.parse(payload);
    const db = inTransaction(tx, this.prisma);
    await this.lockTrip(db, tripId);
    await db.cancelledTrip.createMany({ data: [{ tripId }], skipDuplicates: true });
    const copies = await db.ticketCopy.findMany({
      where: { tripId },
      orderBy: { ticketId: 'asc' },
    });
    await db.ticketCopy.deleteMany({ where: { tripId } });
    await this.queue.enqueue(
      tx,
      copies.map((copy) =>
        cancellation(envelope.eventId, copy.ticketId, {
          ...copy,
          channel: copy.channel as SaleChannel,
          departureAt: copy.departureAt.toISOString(),
        }),
      ),
    );
  }

  // A sale and the deletion of its trip handled at once would each miss the other's row.
  private async lockTrip(db: Prisma.TransactionClient, tripId: string): Promise<void> {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tripId}))`;
  }
}
