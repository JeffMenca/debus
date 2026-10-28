import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { type TestTrips, testTrips } from './support/trips';

describe('the ventas schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trips: TestTrips;

  const ticket = (tripId: string) =>
    prisma.ticket.create({
      data: {
        id: randomUUID(),
        tripId,
        status: 'PENDING',
        channel: 'COUNTER',
        nit: 'CF',
        buyerName: 'Consumidor final',
        unitPrice: 85,
        total: 85,
        paidOn: new Date('2026-10-16'),
      },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    trips = testTrips(prisma);
  });
  afterAll(async () => {
    await trips.cleanUp();
    await app.close();
  });

  it('keeps one departure mark per trip, with no link to the trip copy', async () => {
    const tripId = randomUUID();
    const departedAt = new Date('2026-10-27T15:00:00.000Z');
    const insert = () =>
      prisma.$executeRawUnsafe(
        'INSERT INTO departed_trips (trip_id, departed_at) VALUES ($1::uuid, $2::timestamptz)',
        tripId,
        departedAt,
      );
    try {
      // The mark may arrive before the trip copy does, so it points at nothing.
      await insert();

      await expect(insert()).rejects.toThrow(/departed_trips_pkey/);
      const [row] = await prisma.$queryRawUnsafe<{ departed_at: Date }[]>(
        'SELECT departed_at FROM departed_trips WHERE trip_id = $1::uuid',
        tripId,
      );
      expect(row!.departed_at).toEqual(departedAt);
    } finally {
      await prisma.$executeRawUnsafe('DELETE FROM departed_trips WHERE trip_id = $1::uuid', tripId);
    }
  });

  it('never lets two tickets hold the same seat of a trip', async () => {
    const tripId = await trips.create();
    const first = await ticket(tripId);
    const second = await ticket(tripId);
    await prisma.ticketSeat.create({ data: { tripId, seatNumber: 7, ticketId: first.id } });

    await expect(
      prisma.ticketSeat.create({ data: { tripId, seatNumber: 7, ticketId: second.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects seat numbers below one', async () => {
    const tripId = await trips.create();
    const { id } = await ticket(tripId);

    await expect(
      prisma.ticketSeat.create({ data: { tripId, seatNumber: 0, ticketId: id } }),
    ).rejects.toThrow(/ticket_seats_seat_number_positive/);
  });

  it('frees the seats of a ticket when the ticket goes away', async () => {
    const tripId = await trips.create();
    const { id } = await ticket(tripId);
    await prisma.ticketSeat.createMany({
      data: [1, 2].map((seatNumber) => ({ tripId, seatNumber, ticketId: id })),
    });

    await prisma.ticket.delete({ where: { id } });

    expect(await prisma.ticketSeat.count({ where: { tripId } })).toBe(0);
  });

  describe('purchases', () => {
    const created: string[] = [];
    const purchase = (over: Record<string, unknown> = {}) => {
      const id = randomUUID();
      created.push(id);
      return prisma.purchase.create({
        data: {
          id,
          clientId: randomUUID(),
          tripId: randomUUID(),
          seats: [3, 4],
          amount: 170,
          description: 'Boleto Quetzaltenango - Guatemala, asientos 3 y 4',
          paidOn: new Date('2026-10-20'),
          payBy: new Date('2026-10-20T16:10:00.000Z'),
          status: 'PENDING',
          ...over,
        },
      });
    };
    afterAll(async () => {
      await prisma.purchase.deleteMany({ where: { id: { in: created } } });
    });

    it('records a pending purchase with no ticket and no trip copy behind it', async () => {
      const row = await purchase();

      expect(row).toMatchObject({
        status: 'PENDING',
        failure: null,
        debitAttempts: 0,
        lastError: null,
        lockedUntil: null,
        seats: [3, 4],
      });
    });

    it('requires a failure for a failed purchase and forbids it for any other', async () => {
      await expect(purchase({ status: 'FAILED', failure: null })).rejects.toThrow(
        /purchases_failure_matches_status/,
      );
      await expect(purchase({ status: 'PENDING', failure: 'PAYMENT_EXPIRED' })).rejects.toThrow(
        /purchases_failure_matches_status/,
      );
      await expect(purchase({ status: 'CONFIRMED', failure: 'PAYMENT_EXPIRED' })).rejects.toThrow(
        /purchases_failure_matches_status/,
      );
      await expect(
        purchase({ status: 'FAILED', failure: 'INSUFFICIENT_BALANCE' }),
      ).resolves.toMatchObject({ failure: 'INSUFFICIENT_BALANCE' });
      await expect(purchase({ status: 'CONFIRMED' })).resolves.toMatchObject({
        status: 'CONFIRMED',
      });
    });

    it('survives the removal of the trip copy it refers to', async () => {
      const tripId = await trips.create();
      const row = await purchase({ tripId });

      await prisma.trip.delete({ where: { tripId } });

      expect(await prisma.purchase.findUnique({ where: { id: row.id } })).not.toBeNull();
    });
  });
});
