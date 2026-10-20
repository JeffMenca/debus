import type { WalletMovementKind } from '@debus/contracts';

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
