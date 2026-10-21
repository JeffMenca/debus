import { randomUUID } from 'node:crypto';
import {
  type EventEnvelope,
  refundRequestedPayloadSchema,
  todayInGuatemala,
} from '@debus/contracts';
import { OnEvent, Outbox, type SqlClient } from '@debus/messaging';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CreditedMovement,
  movementFingerprint,
  refundAmount,
  refundDescription,
  toWalletCredited,
} from './wallet-rules';

// Debits take the same row lock, so a refund and a debit of the same ticket never interleave.
const LOCK_WALLET = 'SELECT client_id FROM wallets WHERE client_id = $1::uuid FOR UPDATE';

// The primary key is what refunds a ticket only once. Without a profile no debit could exist.
const MARK = `
  INSERT INTO refunds (reference, client_id, amount, reason)
  SELECT $1::uuid, user_id, 0, $3 FROM client_profiles WHERE user_id = $2::uuid
  ON CONFLICT (reference) DO NOTHING
  RETURNING reference`;

const FIND_DEBIT = `
  SELECT amount::float8 AS amount, description FROM wallet_movements
  WHERE client_id = $1::uuid AND reference = $2::uuid AND kind = 'TICKET'
  LIMIT 1`;

// Also reads who to tell: the wallet hangs from the profile.
const CREDIT = `
  UPDATE wallets w SET balance = w.balance + $2, updated_at = now()
  FROM client_profiles p
  WHERE w.client_id = $1::uuid AND p.user_id = w.client_id
  RETURNING w.balance::float8 AS balance, p.email, p.full_name`;

// now() is when the transaction began, which can be before the debit it returns committed;
// clock_timestamp() is taken after the wallet lock, so the refund always lists after that debit.
const INSERT_MOVEMENT = `
  INSERT INTO wallet_movements (id, client_id, kind, amount, balance_after, reference, description,
    occurred_on, idempotency_key, fingerprint, created_at)
  VALUES ($1::uuid, $2::uuid, 'REFUND', $3, $4, $5::uuid, $6, $7::date, $1::uuid, $8, clock_timestamp())`;

const SETTLE = 'UPDATE refunds SET movement_id = $2::uuid, amount = $3 WHERE reference = $1::uuid';

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
    const sql = tx ?? this.prisma;
    await sql.$queryRawUnsafe(LOCK_WALLET, refund.clientId);
    const marked = await sql.$queryRawUnsafe<unknown[]>(
      MARK,
      refund.ticketId,
      refund.clientId,
      refund.reason,
    );
    if (marked.length === 0) return;

    const [debit] = await sql.$queryRawUnsafe<{ amount: number; description: string }[]>(
      FIND_DEBIT,
      refund.clientId,
      refund.ticketId,
    );
    if (!debit) return;

    const amount = refundAmount(debit.amount);
    if (amount !== refund.amount) {
      this.logger.warn(
        { ticketId: refund.ticketId, charged: amount, requested: refund.amount },
        'Refund amount differs from the debit; the debit wins',
      );
    }
    // The debit was taken from this wallet, so the row is there.
    const [{ balance, email, full_name: fullName }] = await sql.$queryRawUnsafe<
      [{ balance: number; email: string; full_name: string }]
    >(CREDIT, refund.clientId, amount);
    const movementId = randomUUID();
    const occurredOn = todayInGuatemala(new Date(refund.requestedAt));
    const description = refundDescription(debit.description);
    await sql.$executeRawUnsafe(
      INSERT_MOVEMENT,
      movementId,
      refund.clientId,
      amount,
      balance,
      refund.ticketId,
      description,
      occurredOn,
      movementFingerprint({ kind: 'REFUND', amount, occurredOn, reference: refund.ticketId }),
    );
    await sql.$executeRawUnsafe(SETTLE, refund.ticketId, movementId, amount);
    const movement: CreditedMovement = {
      id: movementId,
      clientId: refund.clientId,
      kind: 'REFUND',
      amount,
      balanceAfter: balance,
      description,
      occurredOn,
    };
    await this.outbox.add(
      sql,
      'WalletCredited',
      toWalletCredited(movement, { email, fullName }, new Date()),
    );
  }
}
