import {
  type WalletCreditedPayload,
  type WalletMovementKind,
  walletCreditedPayloadSchema,
} from '@debus/contracts';

export interface MovementIntent {
  kind: WalletMovementKind;
  amount: number;
  occurredOn: string;
  reference: string | null;
}

const toCents = (amount: number): number => Math.round(amount * 100);

// What a request asks for, so a repeated Idempotency-Key can tell a retry from a different request.
export function movementFingerprint({
  kind,
  amount,
  occurredOn,
  reference,
}: MovementIntent): string {
  return [kind, toCents(amount), occurredOn, reference ?? ''].join('|');
}

export const isSameIntent = (existing: { fingerprint: string }, fingerprint: string): boolean =>
  existing.fingerprint === fingerprint;

const CREDITS: readonly WalletMovementKind[] = ['TOP_UP', 'REFUND'];

export function signedAmount(kind: WalletMovementKind, amount: number): number {
  return CREDITS.includes(kind) ? amount : -amount;
}

// A debit sent with payBy is only applied up to that moment, so a payment that was in doubt cannot
// land after the trip left. Repeating one that was already applied is decided before this.
export const paymentWindowClosed = (payBy: string | undefined, now: Date): boolean =>
  payBy !== undefined && now.getTime() > new Date(payBy).getTime();

const DESCRIPTION_MAX = 200;

// What the wallet shows for a refund: "Devolución: Boleto Quetzaltenango - Guatemala, asiento 5".
export const refundDescription = (debitDescription: string): string =>
  `Devolución: ${debitDescription}`.slice(0, DESCRIPTION_MAX);

// A refund gives back what the debit took, never what the request says it cost.
export const refundAmount = (debitAmount: number): number => toCents(Math.abs(debitAmount)) / 100;

export interface CreditedMovement {
  id: string;
  clientId: string;
  kind: WalletCreditedPayload['kind'];
  amount: number;
  balanceAfter: number;
  description: string;
  occurredOn: string;
}

// What notificaciones needs to tell the client that money landed in the wallet.
export const toWalletCredited = (
  movement: CreditedMovement,
  profile: { email: string; fullName: string },
  creditedAt: Date,
): WalletCreditedPayload =>
  walletCreditedPayloadSchema.parse({
    movementId: movement.id,
    clientId: movement.clientId,
    email: profile.email,
    fullName: profile.fullName,
    kind: movement.kind,
    amount: movement.amount,
    balanceAfter: movement.balanceAfter,
    description: movement.description,
    occurredOn: movement.occurredOn,
    creditedAt: creditedAt.toISOString(),
  });
