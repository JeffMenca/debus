import { type Purchase, purchaseSchema } from '@debus/contracts';
import { CircuitOpenError, ServiceRejectedError, ServiceUnavailableError } from '@debus/server';
import { BadGatewayException, HttpException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import type { SoldTicket } from '../tickets/ticket-rules';
import {
  type DebitOutcome,
  PAY_WINDOW_MS,
  debitOutcome,
  failureException,
  payByFor,
  purchaseDescription,
  samePurchase,
  saleStatusProblem,
  toPurchase,
} from './purchase-rules';

const ticketId = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const clientId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const now = new Date('2026-10-19T16:30:00.000Z');
const payBy = new Date('2026-10-19T16:40:00.000Z');
const paid = {
  movementId: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  balance: 30,
  email: 'ana@debus.test',
};
const rejected = (status: number, message = 'no') => new ServiceRejectedError(status, { message });

describe('samePurchase', () => {
  const purchase = { clientId, tripId, seats: [3, 4] };

  it('recognizes a retry of the same purchase, whatever the order of the seats', () => {
    expect(samePurchase(purchase, { tripId, seats: [4, 3] }, clientId)).toBe(true);
  });

  it('tells apart a key used for another client, trip or seats', () => {
    expect(samePurchase(purchase, { tripId, seats: [3, 4] }, tripId)).toBe(false);
    expect(samePurchase(purchase, { tripId: clientId, seats: [3, 4] }, clientId)).toBe(false);
    expect(samePurchase(purchase, { tripId, seats: [3] }, clientId)).toBe(false);
    expect(samePurchase(purchase, { tripId, seats: [3, 5] }, clientId)).toBe(false);
  });
});

describe('payByFor', () => {
  it('gives ten minutes from the creation of the purchase', () => {
    const departure = new Date(now.getTime() + 3 * 24 * 3_600_000);

    expect(payByFor(now, departure).getTime()).toBe(now.getTime() + PAY_WINDOW_MS);
    expect(PAY_WINDOW_MS).toBe(600_000);
  });

  it('never goes past the departure of the trip', () => {
    const departure = new Date(now.getTime() + 5 * 60_000);

    expect(payByFor(now, departure)).toEqual(departure);
  });
});

describe('purchaseDescription', () => {
  it('names the trip and the seats in plain words', () => {
    expect(purchaseDescription('Quetzaltenango', 'Guatemala', [4, 3])).toBe(
      'Boleto Quetzaltenango - Guatemala, asientos 3 y 4',
    );
    expect(purchaseDescription('Quetzaltenango', 'Guatemala', [7])).toBe(
      'Boleto Quetzaltenango - Guatemala, asiento 7',
    );
    expect(purchaseDescription('Quetzaltenango', 'Guatemala', [5, 3, 4])).toBe(
      'Boleto Quetzaltenango - Guatemala, asientos 3, 4 y 5',
    );
  });

  it('fits the 200 characters that the wallet accepts', () => {
    const long = 'Santa Catarina Ixtahuacán '.repeat(10);

    expect(purchaseDescription(long, long, [1, 2, 3]).length).toBeLessThanOrEqual(200);
  });
});

describe('debitOutcome', () => {
  const outcome = (error: unknown, sentBefore = 1, at = now): DebitOutcome =>
    debitOutcome({ error }, sentBefore, payBy, at);

  it('is paid when the wallet applied the debit and told the email', () => {
    expect(debitOutcome({ debit: paid }, 0, payBy, now)).toEqual({
      kind: 'PAID',
      email: 'ana@debus.test',
    });
  });

  it('is in doubt when the wallet applied it but gave no email', () => {
    const withoutEmail = { movementId: paid.movementId, balance: paid.balance };

    expect(debitOutcome({ debit: withoutEmail }, 0, payBy, now)).toMatchObject({
      kind: 'UNKNOWN',
      unexpected: true,
    });
  });

  it('rejects for lack of balance with the message of the wallet', () => {
    expect(outcome(rejected(422, 'No tienes saldo suficiente en tu cartera.'))).toEqual({
      kind: 'REJECTED',
      failure: 'INSUFFICIENT_BALANCE',
      peerMessage: 'No tienes saldo suficiente en tu cartera.',
      unexpected: false,
    });
  });

  it('rejects as expired when the 422 arrives after payBy', () => {
    const late = new Date(payBy.getTime() + 1);

    expect(outcome(rejected(422, 'Se terminó el tiempo.'), 1, late)).toMatchObject({
      kind: 'REJECTED',
      failure: 'PAYMENT_EXPIRED',
      peerMessage: 'Se terminó el tiempo.',
    });
    expect(outcome(rejected(422), 1, payBy)).toMatchObject({ failure: 'INSUFFICIENT_BALANCE' });
  });

  it('rejects when the wallet does not exist yet', () => {
    expect(outcome(rejected(404))).toEqual({
      kind: 'REJECTED',
      failure: 'WALLET_NOT_READY',
      unexpected: false,
    });
  });

  it.each([400, 409])(
    'rejects as a bad request and flags a %s, which should never happen',
    (status) => {
      expect(outcome(rejected(status))).toEqual({
        kind: 'REJECTED',
        failure: 'PAYMENT_REJECTED',
        unexpected: true,
      });
    },
  );

  it('rejects as unavailable when the circuit is open and nothing was ever sent', () => {
    expect(outcome(new CircuitOpenError('clientes', now), 0)).toEqual({
      kind: 'REJECTED',
      failure: 'WALLET_UNAVAILABLE',
      unexpected: false,
    });
  });

  it('stays in doubt when the circuit is open but a debit already left before', () => {
    expect(outcome(new CircuitOpenError('clientes', now), 1)).toMatchObject({
      kind: 'UNKNOWN',
      unexpected: false,
    });
  });

  it.each([
    ['a timeout', new ServiceUnavailableError()],
    ['a network error', new TypeError('fetch failed')],
    ['a rejected identity token', new BadGatewayException()],
    ['anything else', new Error('boom')],
  ])('stays in doubt on %s, even when nothing was sent before', (_name, error) => {
    const result = outcome(error, 0);

    expect(result.kind).toBe('UNKNOWN');
    expect((result as { reason: string }).reason).toEqual(expect.any(String));
  });

  it('keeps the message of the error as the reason that is saved', () => {
    expect(outcome(new TypeError('fetch failed'))).toMatchObject({ reason: 'fetch failed' });
    expect(outcome('weird')).toMatchObject({ kind: 'UNKNOWN', reason: 'Unknown error' });
  });
});

describe('failureException', () => {
  const cases = [
    ['INSUFFICIENT_BALANCE', 422, MESSAGES.insufficientBalance],
    ['PAYMENT_EXPIRED', 422, MESSAGES.paymentExpired],
    ['WALLET_NOT_READY', 409, MESSAGES.accountNotReady],
    ['WALLET_UNAVAILABLE', 503, MESSAGES.walletUnavailable],
    ['PAYMENT_REJECTED', 409, MESSAGES.paymentRejected],
    ['TRIP_CANCELLED', 409, MESSAGES.tripCancelled],
  ] as const;

  it.each(cases)('answers %s with %s and its text', (failure, status, message) => {
    const error = failureException(failure);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(status);
    expect(error.message).toBe(message);
  });

  it('keeps the text of the wallet and says the seats were freed', () => {
    const error = failureException(
      'INSUFFICIENT_BALANCE',
      'No tienes saldo suficiente en tu cartera.',
    );

    expect(error.getStatus()).toBe(422);
    expect(error.message).toBe(
      `No tienes saldo suficiente en tu cartera. ${MESSAGES.seatsReleased}`,
    );
  });
});

describe('saleStatusProblem', () => {
  it('lets a trip that is open go on', () => {
    expect(saleStatusProblem({ tripId, open: true })).toBeNull();
  });

  it.each(['NOT_FOUND', 'NOT_REGULAR'] as const)('answers 404 for %s', (reason) => {
    const error = saleStatusProblem({ tripId, open: false, reason });

    expect(error?.getStatus()).toBe(404);
    expect(error?.message).toBe(MESSAGES.tripNotFound);
  });

  it('answers 409 for a trip that already left', () => {
    const error = saleStatusProblem({ tripId, open: false, reason: 'DEPARTED' });

    expect(error?.getStatus()).toBe(409);
    expect(error?.message).toBe(MESSAGES.tripDeparted);
  });

  it('treats a closed trip without a reason as not found', () => {
    expect(saleStatusProblem({ tripId, open: false })?.getStatus()).toBe(404);
  });
});

describe('toPurchase', () => {
  const row = {
    id: ticketId,
    clientId,
    tripId,
    seats: [3, 4],
    amount: new Prisma.Decimal(170),
    paidOn: new Date('2026-10-19T00:00:00.000Z'),
    status: 'PENDING' as const,
    failure: null,
  };
  const ticket: SoldTicket = {
    id: ticketId,
    tripId,
    status: 'CONFIRMED',
    channel: 'ONLINE',
    clientId,
    nit: 'CF',
    buyerName: 'Ana López',
    email: 'ana@debus.test',
    unitPrice: new Prisma.Decimal(85),
    total: new Prisma.Decimal(170),
    paidOn: row.paidOn,
    createdAt: new Date('2026-10-19T16:30:00.000Z'),
    seats: [{ seatNumber: 3 }, { seatNumber: 4 }],
    trip: {
      tripId,
      branchId: clientId,
      routeId: clientId,
      busId: clientId,
      busPlate: 'C482BTX',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      capacity: 40,
      ticketPrice: new Prisma.Decimal(85),
      departureAt: new Date('2026-10-20T12:00:00.000Z'),
      estimatedArrivalAt: new Date('2026-10-20T16:00:00.000Z'),
      searchText: '',
      createdAt: new Date('2026-10-16T12:00:00.000Z'),
    },
  };

  it('explains a pending purchase and tells the person not to repeat it', () => {
    const purchase = toPurchase(row, null);

    expect(purchase).toEqual<Purchase>({
      ticketId,
      tripId,
      status: 'PENDING',
      seats: [3, 4],
      amount: 170,
      paidOn: '2026-10-19',
      failure: null,
      message: MESSAGES.paymentPending,
      ticket: null,
    });
    expect(purchaseSchema.safeParse(purchase).success).toBe(true);
  });

  it('carries the ticket of a confirmed purchase and no message', () => {
    const purchase = toPurchase({ ...row, status: 'CONFIRMED' }, ticket);

    expect(purchase).toMatchObject({ status: 'CONFIRMED', failure: null, message: null });
    expect(purchase.ticket).toMatchObject({ id: ticketId, seats: [3, 4], total: 170 });
    expect(purchaseSchema.safeParse(purchase).success).toBe(true);
  });

  it('explains a failed purchase with the text of its failure', () => {
    const purchase = toPurchase(
      { ...row, status: 'FAILED', failure: 'INSUFFICIENT_BALANCE' },
      null,
    );

    expect(purchase).toMatchObject({
      status: 'FAILED',
      failure: 'INSUFFICIENT_BALANCE',
      message: MESSAGES.insufficientBalance,
      ticket: null,
    });
    expect(purchaseSchema.safeParse(purchase).success).toBe(true);
  });

  it('refuses to describe a confirmed purchase without its ticket', () => {
    expect(() => toPurchase({ ...row, status: 'CONFIRMED' }, null)).toThrow();
  });
});
