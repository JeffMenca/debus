import { randomUUID } from 'node:crypto';
import { ConflictException, type INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  DuplicateTicketError,
  type SeatReservation,
  SeatReservationsService,
} from '../src/seats/seat-reservations.service';
import { createTestApp } from './support/app';
import { type TestTrips, inHours, testTrips } from './support/trips';

describe('reserving seats while others buy the same ones', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservations: SeatReservationsService;
  let trips: TestTrips;

  const reservation = (tripId: string, seats: number[]): SeatReservation => ({
    ticketId: randomUUID(),
    tripId,
    seats,
    channel: 'COUNTER',
    clientId: null,
    nit: 'CF',
    buyerName: 'Consumidor final',
    email: null,
    paidOn: '2026-10-16',
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    reservations = app.get(SeatReservationsService);
    trips = testTrips(prisma);
  });
  const purchases: string[] = [];
  const purchaseFor = (ticketId: string, tripId: string) => {
    purchases.push(ticketId);
    return prisma.purchase.create({
      data: {
        id: ticketId,
        clientId: randomUUID(),
        tripId,
        seats: [1],
        amount: 85,
        description: 'Boleto de prueba',
        paidOn: new Date('2026-10-16'),
        payBy: new Date(Date.now() + 600_000),
        status: 'PENDING',
      },
    });
  };

  afterAll(async () => {
    await prisma.purchase.deleteMany({ where: { id: { in: purchases } } });
    await trips.cleanUp();
    await app.close();
  });

  it('gives a seat to exactly one of 20 simultaneous buyers', async () => {
    const tripId = await trips.create();

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => reservations.reserve(reservation(tripId, [7]))),
    );

    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);
    for (const result of lost) expect(result.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.ticketSeat.count({ where: { tripId } })).toBe(1);
    expect(await prisma.ticket.count({ where: { tripId } })).toBe(1);
    expect(await prisma.ticket.findFirstOrThrow({ where: { tripId } })).toMatchObject({
      status: 'PENDING',
    });
  });

  it('leaves no seat of the losing selection behind when two selections overlap', async () => {
    const tripId = await trips.create();

    const results = await Promise.allSettled([
      reservations.reserve(reservation(tripId, [1, 2])),
      reservations.reserve(reservation(tripId, [3, 2])),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const taken = await prisma.ticketSeat.findMany({
      where: { tripId },
      orderBy: { seatNumber: 'asc' },
    });
    expect([
      [1, 2],
      [2, 3],
    ]).toContainEqual(taken.map((seat) => seat.seatNumber));
  });

  it('prices the ticket from the trip and refuses one that already left', async () => {
    const open = await trips.create({ ticketPrice: 33.35 });
    const gone = await trips.create({ departureAt: inHours(-2) });

    await expect(reservations.reserve(reservation(open, [4, 5, 6]))).resolves.toMatchObject({
      unitPrice: 33.35,
      total: 100.05,
    });
    await expect(reservations.reserve(reservation(gone, [1]))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('writes the ticket, its seats and the extra writes of the caller together', async () => {
    const tripId = await trips.create({
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Flores',
    });
    const request = reservation(tripId, [3, 4]);

    const reserved = await reservations.reserve(request, () => [
      purchaseFor(request.ticketId, tripId),
    ]);

    expect(reserved).toMatchObject({
      ticketId: request.ticketId,
      total: expect.any(Number),
      originLabel: expect.stringContaining('Quetzaltenango'),
      destinationLabel: expect.stringContaining('Flores'),
      departureAt: expect.any(Date),
    });
    expect(await prisma.ticketSeat.count({ where: { tripId } })).toBe(2);
    expect(await prisma.purchase.count({ where: { id: request.ticketId } })).toBe(1);
  });

  it('saves nothing at all when a seat of the selection is already taken', async () => {
    const tripId = await trips.create();
    await reservations.reserve(reservation(tripId, [2]));
    const losing = reservation(tripId, [1, 2]);

    await expect(
      reservations.reserve(losing, () => [purchaseFor(losing.ticketId, tripId)]),
    ).rejects.toMatchObject({ message: expect.stringContaining('asientos que elegiste') });

    expect(await prisma.ticket.count({ where: { id: losing.ticketId } })).toBe(0);
    expect(await prisma.ticketSeat.count({ where: { tripId } })).toBe(1);
    expect(await prisma.purchase.count({ where: { id: losing.ticketId } })).toBe(0);
  });

  it('saves nothing when the extra write is the one that fails', async () => {
    const tripId = await trips.create();
    const first = reservation(tripId, [1]);
    await reservations.reserve(first, () => [purchaseFor(first.ticketId, tripId)]);
    const clash = { ...reservation(tripId, [2]) };

    await expect(
      reservations.reserve(clash, () => [purchaseFor(first.ticketId, tripId)]),
    ).rejects.toBeInstanceOf(DuplicateTicketError);

    expect(await prisma.ticket.count({ where: { id: clash.ticketId } })).toBe(0);
    expect(await prisma.ticketSeat.count({ where: { tripId, seatNumber: 2 } })).toBe(0);
  });

  it('tells a repeated ticket id apart from a taken seat', async () => {
    const tripId = await trips.create();
    const first = reservation(tripId, [1]);
    await reservations.reserve(first);

    const sameKey = await reservations
      .reserve({ ...reservation(tripId, [2]), ticketId: first.ticketId })
      .catch((reason: unknown) => reason);
    const sameSeat = await reservations
      .reserve(reservation(tripId, [1]))
      .catch((reason: unknown) => reason);

    expect(sameKey).toBeInstanceOf(DuplicateTicketError);
    expect(sameSeat).toBeInstanceOf(ConflictException);
    expect(sameSeat).not.toBeInstanceOf(DuplicateTicketError);
  });
});
