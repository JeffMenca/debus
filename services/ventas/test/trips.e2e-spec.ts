import { randomUUID } from 'node:crypto';
import type { AvailableTripPage, SeatMap, TripPlaces } from '@debus/contracts';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { type TestTrips, inHours, testLabel, testTrips } from './support/trips';

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

  it('matches the origin and the destination exactly, so the way back is another search', async () => {
    const [here, there] = [`${token}o`, `${token}d`];
    const going = await trips.create({ originLabel: here, destinationLabel: there });
    await trips.create({ originLabel: there, destinationLabel: here });

    const { body } = await listTrips({ origin: testLabel(here), destination: testLabel(there) });

    expect((body as AvailableTripPage).items.map((trip) => trip.tripId)).toEqual([going]);
    expect((body as AvailableTripPage).total).toBe(1);
  });

  it('combines the places with the day and the text, and pages what they leave', async () => {
    const [here, there] = [`${token}c`, `${token}e`];
    const departureAt = new Date(inHours(120));
    const day = departureAt.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
    const same = {
      originLabel: here,
      destinationLabel: there,
      departureAt: departureAt.toISOString(),
    };
    const kept = [await trips.create(same), await trips.create(same), await trips.create(same)];
    await trips.create({ ...same, departureAt: inHours(150) });
    await prisma.trip.updateMany({
      where: { tripId: { in: kept } },
      data: { searchText: `${token}c bus` },
    });
    const query = {
      origin: testLabel(here),
      destination: testLabel(there),
      from: day,
      to: day,
      q: `${token}C`,
    };

    const first = await listTrips({ ...query, pageSize: 2 });
    const second = await listTrips({ ...query, pageSize: 2, page: 2 });

    expect(first.body).toMatchObject({ total: 3, page: 1 });
    expect(second.body).toMatchObject({ total: 3, page: 2 });
    const ids = [
      ...(first.body as AvailableTripPage).items,
      ...(second.body as AvailableTripPage).items,
    ].map((trip) => trip.tripId);
    expect([...ids].sort()).toEqual([...kept].sort());
  });

  it('asks for room for every passenger', async () => {
    const origin = testLabel(`${token}s`);
    const tripId = await trips.create({ originLabel: `${token}s` });
    await takeSeats(
      tripId,
      Array.from({ length: 38 }, (_, index) => index + 1),
    );

    const three = await listTrips({ origin, seats: 3 });
    const two = await listTrips({ origin, seats: 2 });
    const eleven = await listTrips({ origin, seats: 11 });

    expect((three.body as AvailableTripPage).total).toBe(0);
    expect((two.body as AvailableTripPage).items).toEqual([
      expect.objectContaining({ tripId, freeSeats: 2 }),
    ]);
    expect(eleven.status).toBe(400);
  });

  it('lists each place with trips on sale once, and none whose trips already left', async () => {
    const [kept, gone] = [`${token}m`, `${token}gone`];
    await trips.create({ originLabel: kept, destinationLabel: gone });
    await trips.create({ originLabel: kept, departureAt: inHours(50) });
    await trips.create({ originLabel: `${token}n` });
    await trips.create({ originLabel: gone, destinationLabel: gone, departureAt: inHours(-2) });

    const { body, status } = await request(app.getHttpServer()).get('/trips/places').set(client);

    expect(status).toBe(200);
    const places = body as TripPlaces;
    expect(places.origins.filter((place) => place === testLabel(kept))).toHaveLength(1);
    expect(places.origins).not.toContain(testLabel(gone));
    expect(places.destinations).toContain(testLabel(gone));
    // In order: only this run's labels are compared, so other trips of the database never matter.
    expect(places.origins.indexOf(testLabel(kept))).toBeLessThan(
      places.origins.indexOf(testLabel(`${token}n`)),
    );
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
    expect((await request(server).get('/trips/places')).status).toBe(401);
  });
});
