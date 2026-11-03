import { randomUUID } from 'node:crypto';
import { todayInGuatemala } from '@debus/contracts';
import type { Outbox, SqlClient } from '@debus/messaging';
import {
  type CreditedMovement,
  movementFingerprint,
  refundAmount,
  refundDescription,
  toWalletCredited,
} from './wallet-rules';

// Debits take the same row lock, so a refund and a debit of the same reference never interleave.
const LOCK_WALLET = 'SELECT client_id FROM wallets WHERE client_id = $1::uuid FOR UPDATE';

// The primary key is what refunds a reference only once. Without a profile no debit could exist.
const MARK = `
  INSERT INTO refunds (reference, client_id, amount, reason)
  SELECT $1::uuid, user_id, 0, $3 FROM client_profiles WHERE user_id = $2::uuid
  ON CONFLICT (reference) DO NOTHING
  RETURNING reference`;

const findDebit = (kind: RefundedDebitKind) => `
  SELECT amount::float8 AS amount, description FROM wallet_movements
  WHERE client_id = $1::uuid AND reference = $2::uuid AND kind = '${kind}'
  LIMIT 1`;

// Also reads who to tell: the wallet hangs from the profile.
const CREDIT = `
  UPDATE wallets w SET balance = w.balance + $2, updated_at = now()
  FROM client_profiles p
  WHERE w.client_id = $1::uuid AND p.user_id = w.client_id
  RETURNING w.balance::float8 AS balance, p.email, p.full_name`;

// now() is when the transaction began, which can be before the debit it returns committed;
// clock_timestamp() is taken after the wallet lock. The debit may carry the clock of the service, so
// a refund also goes past the last movement of the wallet and always lists after that debit.
const INSERT_MOVEMENT = `
  INSERT INTO wallet_movements (id, client_id, kind, amount, balance_after, reference, description,
    occurred_on, idempotency_key, fingerprint, created_at)
  VALUES ($1::uuid, $2::uuid, 'REFUND', $3, $4, $5::uuid, $6, $7::date, $1::uuid, $8,
    GREATEST(clock_timestamp(), (SELECT max(created_at) + interval '1 millisecond'
      FROM wallet_movements WHERE client_id = $2::uuid)))`;

const SETTLE = 'UPDATE refunds SET movement_id = $2::uuid, amount = $3 WHERE reference = $1::uuid';

export type RefundedDebitKind = 'TICKET' | 'RENTAL';

export interface DebitRefund {
  reference: string;
  clientId: string;
  debitKind: RefundedDebitKind;
  reason: string;
  requestedAt: string;
}

// Gives back, once per reference, what the debit of that reference took, and tells the client.
// When nothing was charged the mark stays, so a debit still on its way is no longer applied.
// Answers the amount given back, or null when there was nothing to give.
export async function refundDebit(
  sql: SqlClient,
  outbox: Outbox,
  refund: DebitRefund,
): Promise<number | null> {
  await sql.$queryRawUnsafe(LOCK_WALLET, refund.clientId);
  const marked = await sql.$queryRawUnsafe<unknown[]>(
    MARK,
    refund.reference,
    refund.clientId,
    refund.reason,
  );
  if (marked.length === 0) return null;

  const [debit] = await sql.$queryRawUnsafe<{ amount: number; description: string }[]>(
    findDebit(refund.debitKind),
    refund.clientId,
    refund.reference,
  );
  if (!debit) return null;

  const amount = refundAmount(debit.amount);
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
    refund.reference,
    description,
    occurredOn,
    movementFingerprint({ kind: 'REFUND', amount, occurredOn, reference: refund.reference }),
  );
  await sql.$executeRawUnsafe(SETTLE, refund.reference, movementId, amount);
  const movement: CreditedMovement = {
    id: movementId,
    clientId: refund.clientId,
    kind: 'REFUND',
    amount,
    balanceAfter: balance,
    description,
    occurredOn,
  };
  await outbox.add(
    sql,
    'WalletCredited',
    toWalletCredited(movement, { email, fullName }, new Date()),
  );
  return amount;
}
