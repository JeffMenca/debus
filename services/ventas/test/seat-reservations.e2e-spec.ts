import { randomUUID } from 'node:crypto';
import { ConflictException, type INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  type SeatReservation,
  SeatReservationsService,
} from '../src/seats/seat-reservations.service';
import { createTestApp } from './support/app';
import { inHours, testTrips } from './support/trips';

describe('reserving seats while others buy the same ones', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservations: SeatReservationsService;
  let trips: ReturnType<typeof testTrips>;

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
  afterAll(async () => {
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
});
