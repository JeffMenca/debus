import { randomUUID } from 'node:crypto';
import { FakeServiceClient, ServiceHttpClient } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { type SeededFleet, seedBus, seedDriver, seedFleet } from './support/fleet';
import { identityHeaders } from './support/identity';

const SIMULTANEOUS = 20;
// Waiting for each other must be quick: nobody sits on a connection for tens of seconds.
const MAX_RESPONSE_MS = 15_000;
const BUS_BUSY = 'Ese bus ya tiene un viaje en ese horario.';
const DRIVER_BUSY = 'Ese chofer ya tiene un viaje en ese horario.';
const window = {
  departureAt: '2030-05-10T12:00:00.000Z',
  estimatedArrivalAt: '2030-05-10T16:00:00.000Z',
};

describe('scheduling the same hours many times at once', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let fleet: SeededFleet;
  const flota = new FakeServiceClient();
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', fleet.branchId);
  const schedule = (busId: string, driverId: string) =>
    request(app.getHttpServer())
      .post('/trips')
      .set(admin())
      .send({ routeId: fleet.routeId, busId, driverId, ...window });
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
    await cleanTripTestData(prisma);
    await app.close();
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
});
