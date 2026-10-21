import { WALLET_DEBIT_PATH } from '@debus/contracts';
import {
  CircuitOpenError,
  FakeServiceClient,
  ServiceRejectedError,
  ServiceUnavailableError,
} from '@debus/server';
import { REQUEST_FLUSH } from '@debus/messaging';
import {
  BadGatewayException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { DuplicateTicketError } from '../seats/seat-reservations.service';
import { PurchasesService } from './purchases.service';

const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const ticketId = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const clientId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const actor = { userId: clientId, role: 'CLIENT' as const, branchId: null };
const request = { tripId, seats: [4, 3], paidOn: '2026-10-19' };
const departureAt = new Date(Date.now() + 3 * 24 * 3_600_000);
const SALE_STATUS = `/internal/trips/${tripId}/sale-status`;

const trip = {
  tripId,
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
  busPlate: 'C482BTX',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  capacity: 40,
  ticketPrice: new Prisma.Decimal(85),
  departureAt,
  estimatedArrivalAt: new Date(departureAt.getTime() + 4 * 3_600_000),
  searchText: '',
  createdAt: new Date('2026-10-16T12:00:00.000Z'),
};
const soldTicket = (over: Record<string, unknown> = {}) => ({
  id: ticketId,
  tripId,
  status: 'PENDING',
  channel: 'ONLINE',
  clientId,
  nit: '45218376',
  buyerName: 'Ana López',
  email: null,
  unitPrice: new Prisma.Decimal(85),
  total: new Prisma.Decimal(170),
  paidOn: new Date('2026-10-19T00:00:00.000Z'),
  createdAt: new Date('2026-10-19T16:30:00.000Z'),
  seats: [{ seatNumber: 3 }, { seatNumber: 4 }],
  trip,
  ...over,
});
const pendingRow = (over: Record<string, unknown> = {}) => ({
  id: ticketId,
  clientId,
  tripId,
  seats: [3, 4],
  amount: new Prisma.Decimal(170),
  description: 'Boleto Quetzaltenango - Guatemala, asientos 3 y 4',
  paidOn: new Date('2026-10-19T00:00:00.000Z'),
  payBy: new Date(Date.now() + 600_000),
  status: 'PENDING',
  failure: null,
  debitAttempts: 0,
  lastError: null,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
type Row = ReturnType<typeof pendingRow>;

const paid = {
  movementId: 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  balance: 30,
  email: 'ana@debus.test',
};
const rejected = (status: number, message = 'no') => new ServiceRejectedError(status, { message });

// A Prisma with state: the purchase and its ticket live in `db`, and every write the service makes
// changes them, so each test reads like a scenario and asserts on where the purchase ends up.
function setup() {
  const db: { purchase: Row | null; ticket: ReturnType<typeof soldTicket> | null; busy: boolean } =
    {
      purchase: null,
      ticket: null,
      busy: false,
    };
  const outbox = { add: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue({}) };
  const http = new FakeServiceClient();
  http.respond('viajes', 'GET', SALE_STATUS, { tripId, open: true });
  http.respond('clientes', 'POST', WALLET_DEBIT_PATH, paid);

  const applyWrite = (
    where: { id: string; status?: string },
    data: Record<string, unknown>,
  ): { count: number } => {
    if (!db.purchase || where.id !== db.purchase.id) return { count: 0 };
    if (where.status && where.status !== db.purchase.status) return { count: 0 };
    const lease = data.debitAttempts !== undefined;
    if (lease && (db.busy || db.purchase.status !== 'PENDING')) return { count: 0 };
    if (lease) db.purchase.debitAttempts += 1;
    Object.assign(db.purchase, { ...data, debitAttempts: db.purchase.debitAttempts });
    return { count: 1 };
  };
  const tx = {
    purchase: {
      updateMany: jest.fn(({ where, data }) => {
        if (db.purchase?.status !== 'PENDING') return { count: 0 };
        return applyWrite(where, data);
      }),
    },
    ticket: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!db.ticket) throw Object.assign(new Error('missing'), { code: 'P2025' });
        Object.assign(db.ticket, data);
      }),
      findUniqueOrThrow: jest.fn(async () => db.ticket),
    },
  };
  const prisma = {
    clientNit: {
      findUnique: jest.fn().mockResolvedValue({ clientId, nit: '45218376', fullName: 'Ana López' }),
    },
    purchase: {
      findUnique: jest.fn(async () => (db.purchase ? { ...db.purchase } : null)),
      findUniqueOrThrow: jest.fn(async () => {
        if (!db.purchase) throw Object.assign(new Error('missing'), { code: 'P2025' });
        return { ...db.purchase };
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        db.purchase = pendingRow({ ...data, amount: new Prisma.Decimal(data.amount as number) });
        return { created: data };
      }),
      updateMany: jest.fn(({ where, data }) => applyWrite(where, data)),
    },
    ticket: {
      findUnique: jest.fn(async () => db.ticket),
      deleteMany: jest.fn(() => {
        db.ticket = null;
        return { count: 1 };
      }),
    },
    // A failed transaction leaves the database as it was.
    $transaction: jest.fn(async (work: unknown) => {
      if (typeof work !== 'function') return Promise.all(work as unknown[]);
      const before = {
        purchase: db.purchase && { ...db.purchase },
        ticket: db.ticket && { ...db.ticket },
      };
      try {
        return await work(tx);
      } catch (failure) {
        Object.assign(db, before);
        throw failure;
      }
    }),
  };
  const seats = {
    reserve: jest.fn(async (_request: unknown, alongside: (reserved: unknown) => unknown[]) => {
      db.ticket = soldTicket();
      const reserved = {
        ticketId,
        unitPrice: 85,
        total: 170,
        departureAt,
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Guatemala',
      };
      alongside(reserved);
      return reserved;
    }),
  };
  const service = new PurchasesService(
    prisma as never,
    seats as never,
    http as never,
    outbox as never,
  );
  return { db, tx, prisma, seats, http, outbox, service };
}

const debits = (http: FakeServiceClient) => http.calls.filter((call) => call.method === 'POST');

describe('PurchasesService', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  describe('before anything is held', () => {
    it('asks the person to wait when their account has no copy in ventas yet', async () => {
      const { prisma, seats, http, service } = setup();
      prisma.clientNit.findUnique.mockResolvedValue(null);

      await expect(service.purchase(actor, ticketId, request)).rejects.toThrow(
        new ConflictException(MESSAGES.accountNotReady),
      );

      expect(seats.reserve).not.toHaveBeenCalled();
      expect(http.calls).toHaveLength(0);
    });

    it('answers at once, with nothing held, when the circuit to the wallet is open', async () => {
      const { seats, http, service } = setup();
      http.openCircuit('clientes');

      await expect(service.purchase(actor, ticketId, request)).rejects.toThrow(
        new ServiceUnavailableException(MESSAGES.walletUnavailable),
      );

      expect(seats.reserve).not.toHaveBeenCalled();
    });

    it.each([
      ['NOT_FOUND', 404, MESSAGES.tripNotFound],
      ['NOT_REGULAR', 404, MESSAGES.tripNotFound],
      ['DEPARTED', 409, MESSAGES.tripDeparted],
    ] as const)('refuses a trip that viajes reports as %s', async (reason, status, message) => {
      const { seats, http, service } = setup();
      http.respond('viajes', 'GET', SALE_STATUS, { tripId, open: false, reason });

      const failure = await service.purchase(actor, ticketId, request).catch((e: unknown) => e);

      expect(failure).toMatchObject({ status, message });
      expect(seats.reserve).not.toHaveBeenCalled();
    });

    it.each([
      ['does not answer', new ServiceUnavailableError()],
      ['has an open circuit', new CircuitOpenError('viajes', new Date())],
    ])('holds nothing and charges nothing when viajes %s', async (_case, problem) => {
      const { seats, http, service } = setup();
      http.respond('viajes', 'GET', SALE_STATUS, problem);

      const failure = await service.purchase(actor, ticketId, request).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(failure).toMatchObject({ message: MESSAGES.tripCheckUnavailable });
      expect(seats.reserve).not.toHaveBeenCalled();
      expect(debits(http)).toHaveLength(0);
    });

    it('lets any other failure of viajes through', async () => {
      const { http, service } = setup();
      http.respond('viajes', 'GET', SALE_STATUS, new BadGatewayException());

      await expect(service.purchase(actor, ticketId, request)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('a purchase that is paid', () => {
    it('holds the seats with the purchase record, charges with the ticket id and confirms', async () => {
      const { db, seats, http, tx, service } = setup();

      const result = await service.purchase(actor, ticketId, request, 'c-1');

      expect(seats.reserve).toHaveBeenCalledWith(
        {
          ticketId,
          tripId,
          seats: [4, 3],
          channel: 'ONLINE',
          clientId,
          nit: '45218376',
          buyerName: 'Ana López',
          email: null,
          paidOn: '2026-10-19',
        },
        expect.any(Function),
      );
      expect(debits(http)).toEqual([
        expect.objectContaining({
          service: 'clientes',
          path: WALLET_DEBIT_PATH,
          body: {
            clientId,
            amount: 170,
            kind: 'TICKET',
            reference: ticketId,
            description: 'Boleto Quetzaltenango - Guatemala, asientos 3 y 4',
            occurredOn: '2026-10-19',
            payBy: db.purchase?.payBy.toISOString(),
          },
          options: { correlationId: 'c-1', idempotencyKey: ticketId },
        }),
      ]);
      expect(db.purchase).toMatchObject({ status: 'CONFIRMED', failure: null, lockedUntil: null });
      expect(tx.ticket.update).toHaveBeenCalledWith({
        where: { id: ticketId },
        data: { status: 'CONFIRMED', email: 'ana@debus.test' },
      });
      expect(result).toMatchObject({
        ticketId,
        status: 'CONFIRMED',
        seats: [3, 4],
        amount: 170,
        failure: null,
        message: null,
        ticket: { id: ticketId, status: 'CONFIRMED', channel: 'ONLINE', seats: [3, 4] },
      });
    });

    it('builds the purchase record from the price, the trip and the ten minutes to pay', async () => {
      const { prisma, service } = setup();

      await service.purchase(actor, ticketId, request);

      const { data } = prisma.purchase.create.mock.calls[0]![0];
      expect(data).toMatchObject({
        id: ticketId,
        clientId,
        tripId,
        seats: [3, 4],
        amount: 170,
        description: 'Boleto Quetzaltenango - Guatemala, asientos 3 y 4',
        paidOn: new Date('2026-10-19T00:00:00.000Z'),
        status: 'PENDING',
      });
      const wait = (data.payBy as Date).getTime() - Date.now();
      expect(wait).toBeGreaterThan(590_000);
      expect(wait).toBeLessThanOrEqual(600_000);
    });

    it('announces the sale once, with the email the wallet gave, and flushes the outbox', async () => {
      const { tx, outbox, service } = setup();

      await service.purchase(actor, ticketId, request, 'c-1');

      expect(outbox.add).toHaveBeenCalledTimes(1);
      expect(outbox.add).toHaveBeenCalledWith(
        tx,
        'TicketSold',
        expect.objectContaining({
          ticketId,
          channel: 'ONLINE',
          clientId,
          email: 'ana@debus.test',
          nit: '45218376',
          buyerName: 'Ana López',
          branchId: trip.branchId,
          paidOn: '2026-10-19',
          total: 170,
        }),
        'c-1',
      );
      expect(outbox.flush).toHaveBeenCalledWith(REQUEST_FLUSH);
    });

    it('charges the final consumer NIT when the client has none', async () => {
      const { prisma, seats, service } = setup();
      prisma.clientNit.findUnique.mockResolvedValue({ clientId, nit: null, fullName: 'Ana López' });

      await service.purchase(actor, ticketId, request);

      expect(seats.reserve).toHaveBeenCalledWith(
        expect.objectContaining({ nit: 'CF' }),
        expect.any(Function),
      );
    });

    it('does not announce a sale that another request already confirmed', async () => {
      const { tx, outbox, service } = setup();
      tx.purchase.updateMany.mockReturnValue({ count: 0 });

      await service.purchase(actor, ticketId, request);

      expect(outbox.add).not.toHaveBeenCalled();
    });

    it('stays pending, and says so in the logs, when the confirmation cannot be saved', async () => {
      const { db, tx, outbox, service } = setup();
      tx.ticket.update.mockRejectedValue(new Error('connection lost'));

      const result = await service.purchase(actor, ticketId, request);

      expect(result).toMatchObject({ status: 'PENDING', message: MESSAGES.paymentPending });
      expect(db.purchase?.status).toBe('PENDING');
      expect(outbox.add).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
    });
  });

  describe('a purchase the wallet refuses', () => {
    it('frees the seats and answers with the text of the wallet when the balance is short', async () => {
      const { db, http, outbox, service } = setup();
      http.respond(
        'clientes',
        'POST',
        WALLET_DEBIT_PATH,
        rejected(422, 'No tienes saldo suficiente en tu cartera.'),
      );

      const failure = await service.purchase(actor, ticketId, request).catch((e: unknown) => e);

      expect(failure).toMatchObject({
        status: 422,
        message: `No tienes saldo suficiente en tu cartera. ${MESSAGES.seatsReleased}`,
      });
      expect(db.ticket).toBeNull();
      expect(db.purchase).toMatchObject({
        status: 'FAILED',
        failure: 'INSUFFICIENT_BALANCE',
        lockedUntil: null,
      });
      expect(outbox.add).not.toHaveBeenCalled();
    });

    it('records an expired payment as such when the refusal comes after payBy', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 1, payBy: new Date(Date.now() - 1000) });
      db.ticket = soldTicket();
      http.respond('clientes', 'POST', WALLET_DEBIT_PATH, rejected(422, 'Se terminó el tiempo.'));

      const result = await service.resume(ticketId);

      expect(result).toBe('FAILED');
      expect(db.purchase?.failure).toBe('PAYMENT_EXPIRED');
      expect(db.ticket).toBeNull();
    });

    it('answers 409 and frees the seats when the wallet does not exist yet', async () => {
      const { db, http, service } = setup();
      http.respond('clientes', 'POST', WALLET_DEBIT_PATH, rejected(404));

      await expect(service.purchase(actor, ticketId, request)).rejects.toMatchObject({
        status: 409,
        message: MESSAGES.accountNotReady,
      });

      expect(db.ticket).toBeNull();
      expect(db.purchase?.failure).toBe('WALLET_NOT_READY');
    });

    it('frees the seats and logs an error when the wallet calls the request invalid', async () => {
      const { db, http, service } = setup();
      http.respond('clientes', 'POST', WALLET_DEBIT_PATH, rejected(409));

      await expect(service.purchase(actor, ticketId, request)).rejects.toMatchObject({
        status: 409,
        message: MESSAGES.paymentRejected,
      });

      expect(db.purchase?.failure).toBe('PAYMENT_REJECTED');
      expect(error).toHaveBeenCalled();
    });

    it('frees the seats when the circuit opened and no debit ever left', async () => {
      const { db, http, service } = setup();
      http.respond(
        'clientes',
        'POST',
        WALLET_DEBIT_PATH,
        new CircuitOpenError('clientes', new Date()),
      );

      const failure = await service.purchase(actor, ticketId, request).catch((e: unknown) => e);

      expect(failure).toMatchObject({ status: 503, message: MESSAGES.walletUnavailable });
      expect(db.ticket).toBeNull();
      expect(db.purchase?.failure).toBe('WALLET_UNAVAILABLE');
    });
  });

  describe('a payment in doubt', () => {
    it('keeps the seats and answers pending when the wallet does not answer', async () => {
      const { db, http, outbox, service } = setup();
      http.respond('clientes', 'POST', WALLET_DEBIT_PATH, new ServiceUnavailableError('timeout'));

      const result = await service.purchase(actor, ticketId, request);

      expect(result).toMatchObject({
        status: 'PENDING',
        message: MESSAGES.paymentPending,
        ticket: null,
      });
      expect(db.ticket).not.toBeNull();
      expect(db.purchase).toMatchObject({
        status: 'PENDING',
        lockedUntil: null,
        lastError: 'timeout',
        debitAttempts: 1,
      });
      expect(outbox.add).not.toHaveBeenCalled();
    });

    it('keeps the seats when the wallet answers 200 without the email, and logs an error', async () => {
      const { db, http, service } = setup();
      http.respond('clientes', 'POST', WALLET_DEBIT_PATH, {
        movementId: paid.movementId,
        balance: 30,
      });

      const result = await service.purchase(actor, ticketId, request);

      expect(result.status).toBe('PENDING');
      expect(db.ticket).not.toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('keeps the seats when the circuit opens after a debit already left', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 1 });
      db.ticket = soldTicket();
      http.respond(
        'clientes',
        'POST',
        WALLET_DEBIT_PATH,
        new CircuitOpenError('clientes', new Date()),
      );

      const result = await service.resume(ticketId);

      expect(result).toBe('PENDING');
      expect(db.ticket).not.toBeNull();
      expect(db.purchase?.status).toBe('PENDING');
    });
  });

  describe('resuming a purchase with the same key', () => {
    it('charges again, with the same key, a purchase that was left pending, and confirms it', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 1 });
      db.ticket = soldTicket();

      const result = await service.purchase(actor, ticketId, request);

      expect(result.status).toBe('CONFIRMED');
      expect(debits(http)).toEqual([
        expect.objectContaining({ options: expect.objectContaining({ idempotencyKey: ticketId }) }),
      ]);
      expect(db.purchase?.debitAttempts).toBe(2);
    });

    it('answers a confirmed purchase without calling anybody', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ status: 'CONFIRMED' });
      db.ticket = soldTicket({ status: 'CONFIRMED', email: 'ana@debus.test' });

      const result = await service.purchase(actor, ticketId, request);

      expect(result).toMatchObject({ status: 'CONFIRMED', ticket: { id: ticketId } });
      expect(http.calls).toHaveLength(0);
    });

    it('repeats the error of a failed purchase without calling anybody', async () => {
      const { db, http, seats, service } = setup();
      db.purchase = pendingRow({ status: 'FAILED', failure: 'INSUFFICIENT_BALANCE' });

      await expect(service.purchase(actor, ticketId, request)).rejects.toMatchObject({
        status: 422,
        message: MESSAGES.insufficientBalance,
      });

      expect(http.calls).toHaveLength(0);
      expect(seats.reserve).not.toHaveBeenCalled();
    });

    it('refuses a key that was used for other seats, another trip or another person', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ status: 'CONFIRMED' });

      for (const other of [
        { ...request, seats: [5] },
        { ...request, tripId: ticketId },
      ]) {
        await expect(service.purchase(actor, ticketId, other)).rejects.toThrow(
          new ConflictException(MESSAGES.purchaseKeyReused),
        );
      }
      await expect(
        service.purchase({ ...actor, userId: tripId }, ticketId, request),
      ).rejects.toThrow(new ConflictException(MESSAGES.purchaseKeyReused));
      expect(http.calls).toHaveLength(0);
    });

    it('answers the current state, without charging, while another request holds the purchase', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 1, lockedUntil: new Date(Date.now() + 20_000) });
      db.ticket = soldTicket();
      db.busy = true;

      const result = await service.purchase(actor, ticketId, request);

      expect(result).toMatchObject({ status: 'PENDING', message: MESSAGES.paymentPending });
      expect(debits(http)).toHaveLength(0);
    });

    it('reloads and resumes when another request with the same key reserved first', async () => {
      const { db, seats, service } = setup();
      seats.reserve.mockImplementation(async () => {
        db.purchase = pendingRow();
        db.ticket = soldTicket();
        throw new DuplicateTicketError();
      });

      const result = await service.purchase(actor, ticketId, request);

      expect(result.status).toBe('CONFIRMED');
    });

    it('lets the conflict through when there is no purchase to resume', async () => {
      const { seats, service } = setup();
      seats.reserve.mockRejectedValue(new DuplicateTicketError());

      await expect(service.purchase(actor, ticketId, request)).rejects.toBeInstanceOf(
        DuplicateTicketError,
      );
    });

    it('does not mistake a taken seat for a repeated request', async () => {
      const { db, seats, service } = setup();
      seats.reserve.mockRejectedValue(new ConflictException(MESSAGES.seatTaken));

      await expect(service.purchase(actor, ticketId, request)).rejects.toThrow(
        new ConflictException(MESSAGES.seatTaken),
      );
      expect(db.purchase).toBeNull();
    });
  });

  describe('a ticket that disappeared', () => {
    it('fails the purchase without charging when the ticket is gone and nothing was sent', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 0 });
      db.ticket = null;

      const result = await service.resume(ticketId);

      expect(result).toBe('FAILED');
      expect(db.purchase?.failure).toBe('TRIP_CANCELLED');
      expect(debits(http)).toHaveLength(0);
    });

    it('does not charge again, and logs an error, when it is gone after a debit was in doubt', async () => {
      const { db, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 1 });
      db.ticket = null;

      const result = await service.resume(ticketId);

      expect(result).toBe('PENDING');
      expect(debits(http)).toHaveLength(0);
      expect(db.purchase?.status).toBe('PENDING');
      expect(error).toHaveBeenCalled();
    });
  });

  describe('a trip deleted while the purchase is being paid', () => {
    // What the TripDeleted handler commits: the purchase is closed and the ticket goes with the trip.
    const deleteTripWhenCharging = (
      db: ReturnType<typeof setup>['db'],
      http: FakeServiceClient,
    ) => {
      const post = http.post.bind(http);
      jest.spyOn(http, 'post').mockImplementation(async (...args: Parameters<typeof post>) => {
        Object.assign(db.purchase ?? {}, { status: 'FAILED', failure: 'TRIP_CANCELLED' });
        db.ticket = null;
        return post(...args);
      });
    };

    it('answers that the trip was cancelled when the wallet charged as it was deleted', async () => {
      const { db, http, outbox, service } = setup();
      deleteTripWhenCharging(db, http);

      const failure = await service.purchase(actor, ticketId, request).catch((e: unknown) => e);

      expect(failure).toMatchObject({ status: 409, message: MESSAGES.tripCancelled });
      expect(outbox.add).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('answers that the trip was cancelled, not that the balance is short, when the wallet refuses', async () => {
      const { db, http, service } = setup();
      http.respond('clientes', 'POST', WALLET_DEBIT_PATH, rejected(422, 'Este viaje se canceló.'));
      deleteTripWhenCharging(db, http);

      const failure = await service.purchase(actor, ticketId, request).catch((e: unknown) => e);

      expect(failure).toMatchObject({ message: MESSAGES.tripCancelled });
      expect(db.purchase?.failure).toBe('TRIP_CANCELLED');
    });

    it('keeps the reason of a purchase closed before its first debit left', async () => {
      const { db, prisma, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 0 });
      prisma.ticket.findUnique.mockImplementation(async () => {
        Object.assign(db.purchase ?? {}, { status: 'FAILED', failure: 'TRIP_CANCELLED' });
        return null;
      });

      expect(await service.resume(ticketId)).toBe('FAILED');
      expect(debits(http)).toHaveLength(0);
      expect(db.purchase?.failure).toBe('TRIP_CANCELLED');
    });

    it('answers the closed purchase, without an error, when the ticket went after the claim', async () => {
      const { db, prisma, http, service } = setup();
      db.purchase = pendingRow({ debitAttempts: 1 });
      prisma.ticket.findUnique.mockImplementation(async () => {
        Object.assign(db.purchase ?? {}, { status: 'FAILED', failure: 'TRIP_CANCELLED' });
        return null;
      });

      expect(await service.resume(ticketId)).toBe('FAILED');
      expect(debits(http)).toHaveLength(0);
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('reports where each kind of purchase ends up', async () => {
      const { db, service } = setup();
      db.purchase = pendingRow({ status: 'CONFIRMED' });
      expect(await service.resume(ticketId)).toBe('CONFIRMED');
      db.purchase = pendingRow({ status: 'FAILED', failure: 'PAYMENT_EXPIRED' });
      expect(await service.resume(ticketId)).toBe('FAILED');
    });
  });

  describe('get', () => {
    it('answers the purchase of the person who made it', async () => {
      const { db, service } = setup();
      db.purchase = pendingRow({ status: 'FAILED', failure: 'INSUFFICIENT_BALANCE' });

      expect(await service.get(actor, ticketId)).toMatchObject({
        status: 'FAILED',
        failure: 'INSUFFICIENT_BALANCE',
        message: MESSAGES.insufficientBalance,
      });
    });

    it('answers 404, without saying it exists, for the purchase of someone else', async () => {
      const { db, service } = setup();
      db.purchase = pendingRow();

      await expect(service.get({ ...actor, userId: tripId }, ticketId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('answers 404 for a purchase that does not exist', async () => {
      const { service } = setup();

      await expect(service.get(actor, ticketId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
