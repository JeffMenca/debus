import { randomUUID } from 'node:crypto';
import type { AvailableTripPage, SeatMap } from '@debus/contracts';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { type TestTrips, inHours, testTrips } from './support/trips';

describe('trips on sale and their seat map', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trips: TestTrips;
  // A word only this run's trips carry, so trips of the local stack never get in the way.
  const token = `ruta${Date.now().toString(36)}`;
  const client = identityHeaders(randomUUID(), 'CLIENT');

  const listTrips = (query: Record<string, string | number>) =>
    request(app.getHttpServer()).get('/trips').query(query).set(client);

  const takeSeats = async (tripId: string, seats: number[]) => {
    const id = randomUUID();
    await prisma.ticket.create({
      data: {
        id,
        tripId,
        status: 'CONFIRMED',
        channel: 'COUNTER',
        nit: 'CF',
        buyerName: 'Consumidor final',
        unitPrice: 85,
        total: 85 * seats.length,
        paidOn: new Date('2026-10-16'),
        seats: { create: seats.map((seatNumber) => ({ tripId, seatNumber })) },
      },
    });
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    trips = testTrips(prisma);
  });
  afterAll(async () => {
    await trips.cleanUp();
    await app.close();
  });

  it('lists only the trips that have not left, soonest first, with their free seats', async () => {
    const soon = await trips.create({ originLabel: token, departureAt: inHours(5) });
    const later = await trips.create({ originLabel: token, departureAt: inHours(30) });
    const departed = await trips.create({ originLabel: token, departureAt: inHours(-1) });
    await prisma.trip.updateMany({
      where: { tripId: { in: [soon, later, departed] } },
      data: { searchText: `${token} guatemala c482btx` },
    });
    await takeSeats(soon, [3, 4]);

    const { body, status } = await listTrips({ q: token });

    expect(status).toBe(200);
    const page = body as AvailableTripPage;
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(page.items.map((trip) => [trip.tripId, trip.freeSeats])).toEqual([
      [soon, 38],
      [later, 40],
    ]);
    expect(page.items[0]).toMatchObject({ ticketPrice: 85, busPlate: 'C482BTX', capacity: 40 });
  });

  it('searches without accents and narrows the departure to whole days', async () => {
    const departureAt = new Date(inHours(96));
    const day = departureAt.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
    const tripId = await trips.create({ departureAt: departureAt.toISOString() });
    await prisma.trip.update({
      where: { tripId },
      data: { searchText: `${token}x peten c482btx` },
    });

    const found = await listTrips({ q: `${token}X Petén`, from: day, to: day });
    const otherDay = await listTrips({ q: `${token}x`, from: '2099-01-01' });

    expect((found.body as AvailableTripPage).items.map((trip) => trip.tripId)).toEqual([tripId]);
    expect((otherDay.body as AvailableTripPage).total).toBe(0);
  });

  it('pages on the server', async () => {
    const pageToken = `${token}p`;
    for (const hours of [40, 41, 42]) {
      const tripId = await trips.create({ departureAt: inHours(hours) });
      await prisma.trip.update({ where: { tripId }, data: { searchText: pageToken } });
    }

    const { body } = await listTrips({ q: pageToken, page: 2, pageSize: 2 });

    expect(body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect((body as AvailableTripPage).items).toHaveLength(1);
  });

  it('rejects a range that goes backwards', async () => {
    const { status } = await listTrips({ from: '2026-10-20', to: '2026-10-19' });

    expect(status).toBe(400);
  });

  it('answers the seat map with the taken seats', async () => {
    const tripId = await trips.create();
    await takeSeats(tripId, [12, 5]);

    const { body, status } = await request(app.getHttpServer())
      .get(`/trips/${tripId}/seats`)
      .set(client);

    expect(status).toBe(200);
    expect(body as SeatMap).toMatchObject({
      tripId,
      capacity: 40,
      ticketPrice: 85,
      taken: [5, 12],
    });
  });

  it('answers 404, 400 and 401 where it should', async () => {
    const server = app.getHttpServer();

    expect((await request(server).get(`/trips/${randomUUID()}/seats`).set(client)).status).toBe(
      404,
    );
    expect((await request(server).get('/trips/nope/seats').set(client)).status).toBe(400);
    expect((await request(server).get('/trips')).status).toBe(401);
  });
});
