import { type WalletMovementKind, idempotencyKeySchema } from '@debus/contracts';
import { BadRequestException } from '@nestjs/common';
import { MESSAGES } from '../messages';

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

export function readIdempotencyKey(raw: string | undefined): string {
  const parsed = idempotencyKeySchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestException(MESSAGES.keyMissing);
  return parsed.data;
}
