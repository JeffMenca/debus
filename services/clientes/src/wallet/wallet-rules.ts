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
