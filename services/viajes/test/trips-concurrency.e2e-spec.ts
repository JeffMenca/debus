import { randomUUID } from 'node:crypto';
import { todayInGuatemala } from '@debus/contracts';
import { FakeServiceClient, identityHeaders, ServiceHttpClient } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { type SeededFleet, seedBus, seedDriver, seedFleet } from './support/fleet';
import { arrivalOf, departureOf } from './support/trip-records';

const SIMULTANEOUS = 20;
// Waiting for each other must be quick: nobody sits on a connection for tens of seconds.
const MAX_RESPONSE_MS = 15_000;
const BUS_BUSY = 'Ese bus ya tiene un viaje en ese horario.';
const DRIVER_BUSY = 'Ese chofer ya tiene un viaje en ese horario.';
const window = {
  departureAt: '2030-05-10T12:00:00.000Z',
  estimatedArrivalAt: '2030-05-10T16:00:00.000Z',
};
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe('scheduling the same hours many times at once', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let fleet: SeededFleet;
  const flota = new FakeServiceClient();
  const rateIds: string[] = [];
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', fleet.branchId);
  const schedule = (busId: string, driverId: string) =>
    request(app.getHttpServer())
      .post('/trips')
      .set(admin())
      .send({ routeId: fleet.routeId, busId, driverId, ...window });
  // A trip of the window that already left, or that already arrived, as the cycle would leave it.
  const tripOf = (busId: string, driverId: string, status: 'IN_TRANSIT' | 'COMPLETED') => ({
    type: 'REGULAR' as const,
    status,
    branchId: fleet.branchId,
    routeId: fleet.routeId,
    busId,
    busPlate: 'Z100BCD',
    capacity: 40,
    driverId,
    driverName: 'Chofer de Prueba',
    originLabel: 'Origen',
    destinationLabel: 'Destino',
    departureAt: new Date(window.departureAt),
    estimatedArrivalAt: new Date(window.estimatedArrivalAt),
    ticketPrice: 85,
    createdById: randomUUID(),
    departure: { create: departureOf({ departedAt: minutesAgo(60) }) },
    ...(status === 'COMPLETED' && { arrival: { create: arrivalOf() } }),
  });
  // Sends the burst of requests and also says how long the slowest answer took.
  const burst = async (make: () => ReturnType<typeof schedule>) => {
    const startedAt = Date.now();
    const timed = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, async () => {
        const response = await make();
        return { response, tookMs: Date.now() - startedAt };
      }),
    );
    return {
      responses: timed.map((item) => item.response),
      slowestMs: Math.max(...timed.map((item) => item.tookMs)),
    };
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ServiceHttpClient).useValue(flota),
    );
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    fleet = await seedFleet(prisma, 'concurrencia de viajes');
    // flota says yes to everyone: the database is the one that must say no.
    flota.respond('flota', 'GET', '/internal/availability', {
      bus: { available: true },
      driver: { available: true },
    });
  });
  afterAll(async () => {
    try {
      await prisma.settingsVersionCopy.deleteMany({ where: { id: { in: rateIds } } });
      await cleanTripTestData(prisma);
    } finally {
      await app.close();
    }
  });

  it('schedules exactly one of 20 simultaneous trips of the same bus at the same time', async () => {
    const drivers = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, () => seedDriver(prisma, fleet.branchId)),
    );
    let next = 0;

    const { responses, slowestMs } = await burst(() =>
      schedule(fleet.busId, drivers[next++] ?? fleet.driverId),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(
      responses
        .filter((response) => response.status === 409)
        .every((response) => response.body.message === BUS_BUSY),
    ).toBe(true);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(SIMULTANEOUS - 1);
    expect(slowestMs).toBeLessThan(MAX_RESPONSE_MS);
    expect(await prisma.trip.count({ where: { busId: fleet.busId } })).toBe(1);
    const scheduled = await events.committed<{ busId: string }>('TripScheduled');
    expect(scheduled.filter((payload) => payload.busId === fleet.busId)).toHaveLength(1);
  });

  it('schedules exactly one of 20 simultaneous trips of the same driver in 20 buses', async () => {
    const driverId = await seedDriver(prisma, fleet.branchId);
    const buses = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, () => seedBus(prisma, fleet.branchId)),
    );
    let next = 0;

    const { responses, slowestMs } = await burst(() =>
      schedule(buses[next++] ?? fleet.busId, driverId),
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(
      responses
        .filter((response) => response.status === 409)
        .every((response) => response.body.message === DRIVER_BUSY),
    ).toBe(true);
    expect(slowestMs).toBeLessThan(MAX_RESPONSE_MS);
    expect(await prisma.trip.count({ where: { driverId } })).toBe(1);
    const scheduled = await events.committed<{ driverId: string }>('TripScheduled');
    expect(scheduled.filter((payload) => payload.driverId === driverId)).toHaveLength(1);
  });

  it('schedules exactly one of 20 simultaneous trips in the hours freed by an arrival', async () => {
    // A bus of its own: the first test of the file already holds fleet.busId in the window.
    const busId = await seedBus(prisma, fleet.branchId);
    await prisma.trip.create({
      data: tripOf(busId, await seedDriver(prisma, fleet.branchId), 'COMPLETED'),
    });
    const drivers = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, () => seedDriver(prisma, fleet.branchId)),
    );
    let next = 0;

    const { responses, slowestMs } = await burst(() => schedule(busId, drivers[next++] ?? ''));

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(
      responses
        .filter((response) => response.status === 409)
        .every((response) => response.body.message === BUS_BUSY),
    ).toBe(true);
    expect(slowestMs).toBeLessThan(MAX_RESPONSE_MS);
    expect(await prisma.trip.count({ where: { busId, status: { not: 'COMPLETED' } } })).toBe(1);
  });

  it('never leaves two trips holding the bus at once while an arrival and 20 trips race', async () => {
    // The amount in force on the day of the arrival, so the arrival can go through.
    const rateId = randomUUID();
    rateIds.push(rateId);
    await prisma.settingsVersionCopy.create({
      data: {
        id: rateId,
        depreciationPerKm: 0.85,
        rentalRatePerKm: 12,
        effectiveFrom: new Date(`${todayInGuatemala(minutesAgo(1))}T00:00:00.000Z`),
        createdAt: new Date('2098-01-01T00:00:00.000Z'),
      },
    });
    const busId = await seedBus(prisma, fleet.branchId);
    const onTheRoad = await prisma.trip.create({
      data: tripOf(busId, await seedDriver(prisma, fleet.branchId), 'IN_TRANSIT'),
    });
    const drivers = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, () => seedDriver(prisma, fleet.branchId)),
    );
    let next = 0;

    const [arrival, ...trips] = await Promise.all([
      request(app.getHttpServer())
        .post(`/trips/${onTheRoad.id}/arrival`)
        .set(admin())
        .send({ arrivedAt: minutesAgo(1).toISOString(), endMileageKm: 1100, fuelCost: 10 }),
      ...Array.from({ length: SIMULTANEOUS }, () => schedule(busId, drivers[next++] ?? '')),
    ]);

    expect(arrival.status).toBe(201);
    expect(
      trips.every(
        (response) =>
          response.status === 201 ||
          (response.status === 409 && response.body.message === BUS_BUSY),
      ),
    ).toBe(true);
    expect(trips.filter((response) => response.status === 201).length).toBeLessThanOrEqual(1);
    const [row] = await prisma.$queryRawUnsafe<{ clashes: bigint }[]>(
      `SELECT count(*) AS clashes FROM trips a JOIN trips b ON a.bus_id = b.bus_id AND a.id < b.id
        WHERE a.bus_id = $1::uuid AND a.status <> 'COMPLETED' AND b.status <> 'COMPLETED'
          AND tstzrange(a.departure_at, a.estimated_arrival_at, '[)')
           && tstzrange(b.departure_at, b.estimated_arrival_at, '[)')`,
      busId,
    );
    expect(Number(row?.clashes)).toBe(0);
  });
});
