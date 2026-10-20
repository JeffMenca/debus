import type {
  Purchase,
  PurchaseFailure,
  PurchaseStatus,
  SaleStatus,
  WalletDebit,
} from '@debus/contracts';
import { CircuitOpenError, ServiceRejectedError } from '@debus/server';
import { HttpException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { type SoldTicket, toTicket } from '../tickets/ticket-rules';

// A purchase has ten minutes to be paid, and never beyond the departure of the trip.
export const PAY_WINDOW_MS = 10 * 60_000;
const DESCRIPTION_MAX = 200;

const sortedSeats = (seats: number[]): string => [...seats].sort((a, b) => a - b).join(',');

// A retry sends the same key with the same purchase; anything else reused the key by mistake.
export function samePurchase(
  purchase: { clientId: string; tripId: string; seats: number[] },
  request: { tripId: string; seats: number[] },
  clientId: string,
): boolean {
  return (
    purchase.clientId === clientId &&
    purchase.tripId === request.tripId &&
    sortedSeats(purchase.seats) === sortedSeats(request.seats)
  );
}

export const payByFor = (createdAt: Date, departureAt: Date): Date =>
  new Date(Math.min(createdAt.getTime() + PAY_WINDOW_MS, departureAt.getTime()));

// What the wallet shows on the movement: "Boleto Quetzaltenango - Guatemala, asientos 3 y 4".
export function purchaseDescription(origin: string, destination: string, seats: number[]): string {
  const sorted = [...seats].sort((a, b) => a - b).map(String);
  const list =
    sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} y ${sorted.at(-1)}` : sorted[0];
  const tail = `, ${sorted.length > 1 ? 'asientos' : 'asiento'} ${list}`;
  return `${`Boleto ${origin} - ${destination}`.slice(0, DESCRIPTION_MAX - tail.length)}${tail}`;
}

export type DebitAnswer = { debit: WalletDebit } | { error: unknown };

// unexpected marks what is worth an error in the logs: it should never happen between our own services.
export type DebitOutcome =
  | { kind: 'PAID'; email: string }
  | { kind: 'REJECTED'; failure: PurchaseFailure; peerMessage?: string; unexpected: boolean }
  | { kind: 'UNKNOWN'; reason: string; unexpected: boolean };

const rejection = (
  failure: PurchaseFailure,
  extra: { peerMessage?: string; unexpected?: boolean } = {},
): DebitOutcome => ({ kind: 'REJECTED', failure, unexpected: false, ...extra });

// What the answer of the wallet means for the purchase. Only a definitive answer ends it: while the
// debit is in doubt the money may have moved, so the seats stay held and the same key is tried again.
// sentBefore is how many debits already left before this attempt; with none, an open circuit proves
// that nothing was charged.
export function debitOutcome(
  answer: DebitAnswer,
  sentBefore: number,
  payBy: Date,
  now: Date,
): DebitOutcome {
  if ('debit' in answer) {
    return answer.debit.email
      ? { kind: 'PAID', email: answer.debit.email }
      : {
          kind: 'UNKNOWN',
          reason: 'The wallet answered without the email of the client',
          unexpected: true,
        };
  }
  const { error } = answer;
  if (error instanceof CircuitOpenError) {
    return sentBefore === 0
      ? rejection('WALLET_UNAVAILABLE')
      : { kind: 'UNKNOWN', reason: error.message, unexpected: false };
  }
  if (error instanceof ServiceRejectedError) {
    const status = error.getStatus();
    if (status === 422) {
      const failure = now.getTime() > payBy.getTime() ? 'PAYMENT_EXPIRED' : 'INSUFFICIENT_BALANCE';
      return rejection(failure, { peerMessage: error.message });
    }
    if (status === 404) return rejection('WALLET_NOT_READY');
    return rejection('PAYMENT_REJECTED', { unexpected: true });
  }
  const reason = error instanceof Error ? error.message : 'Unknown error';
  return { kind: 'UNKNOWN', reason, unexpected: false };
}

const FAILURES: Record<PurchaseFailure, { status: number; message: string }> = {
  INSUFFICIENT_BALANCE: { status: 422, message: MESSAGES.insufficientBalance },
  PAYMENT_EXPIRED: { status: 422, message: MESSAGES.paymentExpired },
  WALLET_NOT_READY: { status: 409, message: MESSAGES.accountNotReady },
  WALLET_UNAVAILABLE: { status: 503, message: MESSAGES.walletUnavailable },
  PAYMENT_REJECTED: { status: 409, message: MESSAGES.paymentRejected },
  TRIP_CANCELLED: { status: 409, message: MESSAGES.tripCancelled },
};

// The answer to the person for a purchase that failed. When the wallet explained why, its text is
// the one shown, since it knows the cause; the person is also told that the seats are free again.
export function failureException(failure: PurchaseFailure, peerMessage?: string): HttpException {
  const { status, message } = FAILURES[failure];
  return new HttpException(
    peerMessage ? `${peerMessage} ${MESSAGES.seatsReleased}` : message,
    status,
  );
}

// What viajes says about a trip that is not on sale, as the answer for the person.
export function saleStatusProblem(status: SaleStatus): HttpException | null {
  if (status.open) return null;
  if (status.reason === 'DEPARTED') return new HttpException(MESSAGES.tripDeparted, 409);
  return new HttpException(MESSAGES.tripNotFound, 404);
}

type PurchaseRow = Prisma.PurchaseGetPayload<object>;

function messageFor(status: PurchaseStatus, failure: PurchaseFailure | null): string | null {
  if (status === 'PENDING') return MESSAGES.paymentPending;
  return failure ? FAILURES[failure].message : null;
}

export function toPurchase(
  row: Pick<PurchaseRow, 'id' | 'tripId' | 'seats' | 'amount' | 'paidOn' | 'status' | 'failure'>,
  ticket: SoldTicket | null,
): Purchase {
  if (row.status === 'CONFIRMED' && !ticket) throw new Error(`Purchase ${row.id} has no ticket`);
  return {
    ticketId: row.id,
    tripId: row.tripId,
    status: row.status,
    seats: [...row.seats].sort((a, b) => a - b),
    amount: row.amount.toNumber(),
    paidOn: row.paidOn.toISOString().slice(0, 10),
    failure: row.failure,
    message: messageFor(row.status, row.failure),
    ticket: row.status === 'CONFIRMED' && ticket ? toTicket(ticket) : null,
  };
}
