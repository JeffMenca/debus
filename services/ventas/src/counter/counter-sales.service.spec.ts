import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';
import { CounterSalesService } from './counter-sales.service';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const tripId = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
const ticketId = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';
const clientId = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const actor = {
  userId: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  role: 'CASHIER' as const,
  branchId,
};
const request = { tripId, seats: [10, 9], paidOn: '2026-10-18', nit: 'CF' };

const trip = {
  tripId,
  branchId,
  routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
  busPlate: 'C482BTX',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  capacity: 40,
  ticketPrice: new Prisma.Decimal(85.5),
  departureAt: new Date('2026-10-20T11:30:00.000Z'),
  estimatedArrivalAt: new Date('2026-10-20T15:45:00.000Z'),
  searchText: '',
  createdAt: new Date('2026-10-16T12:00:00.000Z'),
};
const ticket = (over: Record<string, unknown> = {}) => ({
  id: ticketId,
  tripId,
  status: 'CONFIRMED',
  channel: 'COUNTER',
  clientId: null,
  nit: 'CF',
  buyerName: 'Consumidor final',
  email: null,
  unitPrice: new Prisma.Decimal(85.5),
  total: new Prisma.Decimal(171),
  paidOn: new Date('2026-10-18T00:00:00.000Z'),
  createdAt: new Date('2026-10-18T15:30:00.000Z'),
  seats: [{ seatNumber: 9 }, { seatNumber: 10 }],
  trip,
  ...over,
});

function setup() {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    ticket: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(ticket()),
    },
  };
  const prisma = {
    ticket: { findUnique: jest.fn().mockResolvedValue(null) },
    trip: { findUnique: jest.fn().mockResolvedValue(trip) },
    clientNit: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const seats = { reserve: jest.fn().mockResolvedValue({ ticketId, unitPrice: 85.5, total: 171 }) };
  const outbox = { add: jest.fn().mockResolvedValue({}), flush: jest.fn().mockResolvedValue({}) };
  const service = new CounterSalesService(prisma as never, seats as never, outbox as never);
  return { tx, prisma, seats, outbox, service };
}

describe('CounterSalesService', () => {
  it('holds the seats, confirms the cash sale and announces it in the same transaction', async () => {
    const { tx, seats, outbox, service } = setup();

    const sold = await service.sell(actor, ticketId, request, 'c-1');

    expect(seats.reserve).toHaveBeenCalledWith({
      ticketId,
      tripId,
      seats: [10, 9],
      channel: 'COUNTER',
      clientId: null,
      nit: 'CF',
      buyerName: 'Consumidor final',
      email: null,
      paidOn: '2026-10-18',
    });
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: ticketId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    expect(outbox.add).toHaveBeenCalledWith(
      tx,
      'TicketSold',
      expect.objectContaining({ ticketId, branchId, channel: 'COUNTER', total: 171 }),
      'c-1',
    );
    expect(outbox.flush).toHaveBeenCalledWith({ limit: 10, budgetMs: 2000 });
    expect(sold).toMatchObject({ id: ticketId, status: 'CONFIRMED', seats: [9, 10] });
  });

  it('links the sale again when it is confirmed, in case the NIT arrived meanwhile', async () => {
    const { tx, service } = setup();

    await service.sell(actor, ticketId, { ...request, nit: '45218376' });

    const [[sql, id]] = tx.$executeRawUnsafe.mock.calls;
    expect(sql).toContain('client_id IS NULL');
    expect(sql).toContain('FROM client_nits');
    expect(id).toBe(ticketId);
    expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
      tx.ticket.findUniqueOrThrow.mock.invocationCallOrder[0]!,
    );
  });

  it('links the sale to the client who holds the NIT and uses their name', async () => {
    const { prisma, seats, service } = setup();
    prisma.clientNit.findFirst.mockResolvedValue({ clientId, fullName: 'Ana Méndez' });

    await service.sell(actor, ticketId, { ...request, nit: '45218376', email: 'a@b.com' });

    expect(prisma.clientNit.findFirst).toHaveBeenCalledWith({
      where: { nit: '45218376' },
      orderBy: { updatedAt: 'desc' },
    });
    expect(seats.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ clientId, buyerName: 'Ana Méndez', email: 'a@b.com' }),
    );
  });

  it('never looks up a client for the generic counter NIT', async () => {
    const { prisma, service } = setup();

    await service.sell(actor, ticketId, request);

    expect(prisma.clientNit.findFirst).not.toHaveBeenCalled();
  });

  it('answers 404 for a trip it does not know and 403 for one of another branch', async () => {
    const { prisma, seats, service } = setup();

    prisma.trip.findUnique.mockResolvedValueOnce(null);
    await expect(service.sell(actor, ticketId, request)).rejects.toBeInstanceOf(NotFoundException);
    prisma.trip.findUnique.mockResolvedValueOnce({ ...trip, branchId: clientId });
    await expect(service.sell(actor, ticketId, request)).rejects.toThrow(
      new ForbiddenException(MESSAGES.otherBranch),
    );
    expect(seats.reserve).not.toHaveBeenCalled();
  });

  it('refuses staff without a branch', async () => {
    const { service } = setup();

    await expect(
      service.sell({ ...actor, branchId: null }, ticketId, request),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers a retry with the same ticket and never announces it twice', async () => {
    const { prisma, seats, outbox, service } = setup();
    prisma.ticket.findUnique.mockResolvedValue(ticket());

    const sold = await service.sell(actor, ticketId, request);

    expect(sold.id).toBe(ticketId);
    expect(seats.reserve).not.toHaveBeenCalled();
    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('finishes a sale left pending by a failure before its confirmation', async () => {
    const { prisma, seats, outbox, service } = setup();
    prisma.ticket.findUnique.mockResolvedValue(ticket({ status: 'PENDING' }));

    await service.sell(actor, ticketId, request);

    expect(seats.reserve).not.toHaveBeenCalled();
    expect(outbox.add).toHaveBeenCalledTimes(1);
  });

  it('announces nothing when another request confirmed the sale first', async () => {
    const { tx, prisma, outbox, service } = setup();
    prisma.ticket.findUnique.mockResolvedValue(ticket({ status: 'PENDING' }));
    tx.ticket.updateMany.mockResolvedValue({ count: 0 });

    await service.sell(actor, ticketId, request);

    expect(outbox.add).not.toHaveBeenCalled();
  });

  it('refuses a key already used for a different sale, without calling it a taken seat', async () => {
    const { prisma, service } = setup();
    prisma.ticket.findUnique.mockResolvedValue(ticket({ seats: [{ seatNumber: 3 }] }));

    await expect(service.sell(actor, ticketId, request)).rejects.toThrow(
      new ConflictException(MESSAGES.saleKeyReused),
    );
  });

  it('answers with the ticket of a request with the same key that won the race', async () => {
    const { prisma, seats, service } = setup();
    seats.reserve.mockRejectedValue(new ConflictException(MESSAGES.seatTaken));
    prisma.ticket.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(ticket());

    await expect(service.sell(actor, ticketId, request)).resolves.toMatchObject({ id: ticketId });
  });

  it('passes on a seat that someone else bought', async () => {
    const { seats, service } = setup();
    seats.reserve.mockRejectedValue(new ConflictException(MESSAGES.seatTaken));

    await expect(service.sell(actor, ticketId, request)).rejects.toThrow(MESSAGES.seatTaken);
  });

  it('passes on any other failure of the reservation', async () => {
    const { prisma, seats, service } = setup();
    seats.reserve.mockRejectedValue(new Error('down'));

    await expect(service.sell(actor, ticketId, request)).rejects.toThrow('down');
    expect(prisma.ticket.findUnique).toHaveBeenCalledTimes(1);
  });
});
