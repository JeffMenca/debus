import { type EventEnvelope, rentalCancelledPayloadSchema } from '@debus/contracts';
import { OnEvent, Outbox, type SqlClient } from '@debus/messaging';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { refundDebit } from '../wallet/wallet-refunds';

// Takes the row lock a payment takes, and changes nothing when the rental is already cancelled.
const CANCEL = `
  UPDATE rentals SET status = 'CANCELLED', cancelled_at = $2::timestamptz
  WHERE id = $1::uuid AND status <> 'CANCELLED'
  RETURNING client_id`;

// Step after the pivot of the cancellation saga: viajes already cancelled the paid rental, so here
// it is only marked and, if it was paid from a wallet, refunded. Retried until it applies.
@Injectable()
export class RentalCancelledHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
  ) {}

  @OnEvent('RentalCancelled')
  async cancelled(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const event = rentalCancelledPayloadSchema.parse(payload);
    const sql = tx ?? this.prisma;
    const [rental] = await sql.$queryRawUnsafe<{ client_id: string | null }[]>(
      CANCEL,
      event.rentalId,
      event.cancelledAt,
    );
    // A counter rental was paid in cash, which the branch gives back at the counter.
    if (!rental?.client_id) return;
    await refundDebit(sql, this.outbox, {
      reference: event.rentalId,
      clientId: rental.client_id,
      debitKind: 'RENTAL',
      reason: 'RENTAL_CANCELLED',
      requestedAt: event.cancelledAt,
    });
  }
}
