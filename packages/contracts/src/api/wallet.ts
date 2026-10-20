import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { emailSchema } from './auth';
import { pagedDayRangeQuery } from './day-range';
import { pageSchema } from './pagination';
import { moneySchema } from './settings';

export const WALLET_MOVEMENT_KINDS = ['TOP_UP', 'TICKET', 'RENTAL', 'REFUND'] as const;
export type WalletMovementKind = (typeof WALLET_MOVEMENT_KINDS)[number];

export const walletSchema = z.object({
  balance: z.number().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type Wallet = z.infer<typeof walletSchema>;

// Sent with an Idempotency-Key header, so a repeated request never tops up twice.
export const topUpRequestSchema = z.object({ amount: moneySchema, paidOn: isoDateSchema });
export type TopUpRequest = z.infer<typeof topUpRequestSchema>;

// Debits are negative; balanceAfter is the balance once the movement applied.
export const walletMovementSchema = z.object({
  id: z.uuid(),
  kind: z.enum(WALLET_MOVEMENT_KINDS),
  amount: z.number(),
  balanceAfter: z.number().nonnegative(),
  reference: z.uuid().nullable(),
  description: z.string(),
  occurredOn: isoDateSchema,
  createdAt: z.iso.datetime(),
});
export type WalletMovement = z.infer<typeof walletMovementSchema>;

export const walletMovementListQuerySchema = pagedDayRangeQuery({
  kind: z.enum(['all', ...WALLET_MOVEMENT_KINDS]).default('all'),
});
export type WalletMovementListQuery = z.infer<typeof walletMovementListQuerySchema>;
export const walletMovementPageSchema = pageSchema(walletMovementSchema);
export type WalletMovementPage = z.infer<typeof walletMovementPageSchema>;

/**
 * ventas -> clientes, with Idempotency-Key = reference (the ticket id). The same key with the same
 * body answers the first result again (200); with another body, 409; without balance, 422.
 * payBy is the moment after which a new debit is refused (422): a repeat of one already applied
 * still answers 200, so a payment that was in doubt gets its final answer.
 */
export const WALLET_DEBIT_PATH = '/internal/wallet/debits';

export const walletDebitRequestSchema = z.object({
  clientId: z.uuid(),
  amount: moneySchema,
  kind: z.enum(['TICKET', 'RENTAL']),
  reference: z.uuid(),
  description: z.string().min(1).max(200),
  occurredOn: isoDateSchema,
  payBy: z.iso.datetime().optional(),
});
export type WalletDebitRequest = z.infer<typeof walletDebitRequestSchema>;

export const walletDebitSchema = z.object({
  movementId: z.uuid(),
  balance: z.number().nonnegative(),
  // The email of the client, so the sale can announce who bought without another call.
  email: emailSchema.optional(),
});
export type WalletDebit = z.infer<typeof walletDebitSchema>;
