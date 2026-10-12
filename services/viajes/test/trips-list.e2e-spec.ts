import { randomUUID } from 'node:crypto';
import { saleStatusSchema, tripPageSchema, tripSchema } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { type SeededFleet, seedFleet } from './support/fleet';
import { identityHeaders } from './support/identity';

describe('listing trips and their sale status', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fleet: SeededFleet;
  let other: SeededFleet;
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', fleet.branchId);
  const http = () => request(app.getHttpServer());

  // One trip per call; the bus and the driver are fresh so the windows never collide.
  const newTrip = (owner: SeededFleet, over: Record<string, unknown> = {}) =>
    prisma.trip.create({
      data: {
        type: 'REGULAR',
        status: 'SCHEDULED',
        branchId: owner.branchId,
        routeId: owner.routeId,
        busId: randomUUID(),
        busPlate: 'Z777ABC',
        capacity: 40,
        driverId: randomUUID(),
        driverName: 'Ana Sic',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Guatemala',
        departureAt: new Date('2030-06-10T12:00:00Z'),
        estimatedArrivalAt: new Date('2030-06-10T16:00:00Z'),
        ticketPrice: 85,
        createdById: randomUUID(),
        ...over,
      },
    });
  const idsOf = (response: request.Response) =>
    tripPageSchema.parse(response.body).items.map((trip) => trip.id);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fleet = await seedFleet(prisma, 'lista de viajes');
    other = await seedFleet(prisma, 'lista de otra sucursal');
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('lists only the trips of the branch, soonest first, with the Guatemalan day of each', async () => {
    const late = await newTrip(fleet, {
      departureAt: new Date('2030-07-01T18:00:00Z'),
      estimatedArrivalAt: new Date('2030-07-01T22:00:00Z'),
    });
    const early = await newTrip(fleet, {
      departureAt: new Date('2030-07-01T09:00:00Z'),
      estimatedArrivalAt: new Date('2030-07-01T12:00:00Z'),
    });
    const foreign = await newTrip(other, {
      departureAt: new Date('2030-07-01T10:00:00Z'),
      estimatedArrivalAt: new Date('2030-07-01T13:00:00Z'),
    });

    const ids = idsOf(
      await http().get('/trips?from=2030-07-01&to=2030-07-01').set(admin()).expect(200),
    );

    expect(ids).toEqual([early.id, late.id]);
    expect(ids).not.toContain(foreign.id);
  });

  it('includes a trip at 23:30 Guatemala time in its own day and not in the next one', async () => {
    const night = await newTrip(fleet, {
      departureAt: new Date('2030-08-10T05:30:00Z'),
      estimatedArrivalAt: new Date('2030-08-10T08:30:00Z'),
    });

    const sameDay = idsOf(
      await http().get('/trips?from=2030-08-09&to=2030-08-09').set(admin()).expect(200),
    );
    const nextDay = idsOf(
      await http().get('/trips?from=2030-08-10&to=2030-08-10').set(admin()).expect(200),
    );

    expect(sameDay).toContain(night.id);
    expect(nextDay).not.toContain(night.id);
  });

  it('pages the result and filters by status', async () => {
    const day = '2030-09-01';
    for (let hour = 8; hour < 11; hour++) {
      await newTrip(fleet, {
        departureAt: new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`),
        estimatedArrivalAt: new Date(`${day}T${String(hour).padStart(2, '0')}:30:00Z`),
      });
    }
    const moving = await newTrip(fleet, {
      status: 'IN_TRANSIT',
      departureAt: new Date(`${day}T15:00:00Z`),
      estimatedArrivalAt: new Date(`${day}T17:00:00Z`),
    });

    const page = tripPageSchema.parse(
      (await http().get(`/trips?from=${day}&to=${day}&pageSize=2&page=2`).set(admin()).expect(200))
        .body,
    );
    const inTransit = idsOf(
      await http().get(`/trips?from=${day}&to=${day}&status=IN_TRANSIT`).set(admin()).expect(200),
    );

    expect(page).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(inTransit).toEqual([moving.id]);
  });

  it('finds a trip by plate and by destination, without accents', async () => {
    const trip = await newTrip(fleet, {
      busPlate: 'Z555QWE',
      destinationLabel: 'Petén',
      departureAt: new Date('2030-10-01T12:00:00Z'),
      estimatedArrivalAt: new Date('2030-10-01T15:00:00Z'),
    });

    expect(idsOf(await http().get('/trips?q=z555qwe').set(admin()).expect(200))).toContain(trip.id);
    expect(idsOf(await http().get('/trips?q=peten').set(admin()).expect(200))).toContain(trip.id);
  });

  it('shows one trip of the branch and hides the ones of another branch', async () => {
    const mine = await newTrip(fleet);
    const foreign = await newTrip(other);

    expect(
      tripSchema.parse((await http().get(`/trips/${mine.id}`).set(admin()).expect(200)).body).id,
    ).toBe(mine.id);
    const missing = await http().get(`/trips/${foreign.id}`).set(admin()).expect(404);
    expect(missing.body.message).toBe('No encontramos ese viaje.');
    await http().get('/trips/not-an-id').set(admin()).expect(400);
  });

  it('rejects a range that ends before it starts and anyone who is not a branch admin', async () => {
    await http().get('/trips?from=2030-01-02&to=2030-01-01').set(admin()).expect(400);
    await http()
      .get('/trips')
      .set(identityHeaders(randomUUID(), 'CASHIER', fleet.branchId))
      .expect(403);
    await http().get('/trips').expect(401);
  });

  describe('GET /internal/trips/:id/sale-status', () => {
    const status = (id: string) => http().get(`/internal/trips/${id}/sale-status`).expect(200);

    it('opens a future regular trip with its price and capacity, with no session at all', async () => {
      const trip = await newTrip(fleet, {
        departureAt: new Date('2999-01-01T12:00:00Z'),
        estimatedArrivalAt: new Date('2999-01-01T15:00:00Z'),
      });

      const answer = saleStatusSchema.parse((await status(trip.id)).body);

      expect(answer).toEqual({
        tripId: trip.id,
        open: true,
        ticketPrice: 85,
        capacity: 40,
        departureAt: '2999-01-01T12:00:00.000Z',
      });
    });

    it('closes a trip that left, a rental and a trip that does not exist', async () => {
      const left = await newTrip(fleet, {
        status: 'IN_TRANSIT',
        departureAt: new Date('2999-02-01T12:00:00Z'),
        estimatedArrivalAt: new Date('2999-02-01T15:00:00Z'),
      });
      const rental = await newTrip(fleet, {
        type: 'RENTAL',
        ticketPrice: null,
        departureAt: new Date('2999-03-01T12:00:00Z'),
        estimatedArrivalAt: new Date('2999-03-01T15:00:00Z'),
      });
      const past = await newTrip(fleet, {
        departureAt: new Date('2001-01-01T12:00:00Z'),
        estimatedArrivalAt: new Date('2001-01-01T15:00:00Z'),
      });
      const unknown = randomUUID();

      expect((await status(left.id)).body).toMatchObject({ open: false, reason: 'DEPARTED' });
      expect((await status(rental.id)).body).toMatchObject({ open: false, reason: 'NOT_REGULAR' });
      expect((await status(past.id)).body).toMatchObject({ open: false, reason: 'DEPARTED' });
      expect((await status(unknown)).body).toEqual({
        tripId: unknown,
        open: false,
        reason: 'NOT_FOUND',
      });
    });

    it('refuses an id that is not a UUID', async () => {
      await http().get('/internal/trips/not-an-id/sale-status').expect(400);
    });
  });
});
