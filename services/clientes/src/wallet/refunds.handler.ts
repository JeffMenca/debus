import { type EventEnvelope, refundRequestedPayloadSchema } from '@debus/contracts';
import { OnEvent, Outbox, type SqlClient } from '@debus/messaging';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { refundDebit } from './wallet-refunds';

// ventas asks for a refund when it may have charged a ticket of a deleted trip. Only a debit that
// really happened is given back; when there was none, the mark keeps a late one from being applied.
@Injectable()
export class RefundsHandler {
  private readonly logger = new Logger(RefundsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox,
  ) {}

  @OnEvent('RefundRequested')
  async requested(payload: unknown, _envelope: EventEnvelope, tx?: SqlClient): Promise<void> {
    const refund = refundRequestedPayloadSchema.parse(payload);
    const given = await refundDebit(tx ?? this.prisma, this.outbox, {
      reference: refund.ticketId,
      clientId: refund.clientId,
      debitKind: 'TICKET',
      reason: refund.reason,
      requestedAt: refund.requestedAt,
    });
    if (given !== null && given !== refund.amount) {
      this.logger.warn(
        { ticketId: refund.ticketId, charged: given, requested: refund.amount },
        'Refund amount differs from the debit; the debit wins',
      );
    }
  }
}
