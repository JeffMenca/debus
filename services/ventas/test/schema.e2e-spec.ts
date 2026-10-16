import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testTrips } from './support/trips';

describe('the ventas schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trips: ReturnType<typeof testTrips>;

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
});
