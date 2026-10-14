import { randomUUID } from 'node:crypto';
import { tripScheduledPayloadSchema, tripSchema } from '@debus/contracts';
import {
  FakeServiceClient,
  identityHeaders,
  ServiceHttpClient,
  ServiceUnavailableError,
} from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { type SeededFleet, seedBus, seedDriver, seedFleet } from './support/fleet';

const AVAILABLE = { bus: { available: true }, driver: { available: true } };
const window = {
  departureAt: '2030-03-10T12:00:00.000Z',
  estimatedArrivalAt: '2030-03-10T16:00:00.000Z',
};

describe('scheduling a trip', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let fleet: SeededFleet;
  const flota = new FakeServiceClient();
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', fleet.branchId);
  const http = () => request(app.getHttpServer());
  const body = (over: Record<string, unknown> = {}) => ({
    routeId: fleet.routeId,
    busId: fleet.busId,
    driverId: fleet.driverId,
    ...window,
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ServiceHttpClient).useValue(flota),
    );
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    fleet = await seedFleet(prisma, 'programar viajes');
  });
  beforeEach(() => {
    flota.calls.length = 0;
    flota.respond('flota', 'GET', '/internal/availability', AVAILABLE);
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('schedules a trip with the data of the copies and queues TripScheduled', async () => {
    const own = {
      ...fleet,
      busId: await seedBus(prisma, fleet.branchId),
      driverId: await seedDriver(prisma, fleet.branchId),
    };

    const response = await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId: own.busId, driverId: own.driverId }))
      .expect(201);

    expect(tripSchema.parse(response.body)).toMatchObject({
      type: 'REGULAR',
      status: 'SCHEDULED',
      branchId: fleet.branchId,
      routeId: fleet.routeId,
      busId: own.busId,
      driverName: 'Chofer de Prueba',
      ticketPrice: 85,
      capacity: 40,
      departureAt: window.departureAt,
      estimatedArrivalAt: window.estimatedArrivalAt,
    });
    expect(response.body.originName).toContain('programar viajes');
    expect(response.body.destinationName).toContain('programar viajes destino');
    expect(flota.calls).toHaveLength(1);
    expect(flota.calls[0]?.path).toContain(`busId=${own.busId}`);
    const scheduled = (await events.committed('TripScheduled')).map((payload) =>
      tripScheduledPayloadSchema.parse(payload),
    );
    expect(scheduled).toContainEqual(
      expect.objectContaining({
        tripId: response.body.id,
        type: 'REGULAR',
        ticketPrice: 85,
        rentalId: null,
        busPlate: response.body.busPlate,
      }),
    );
  });

  it('refuses a bus in the workshop with the reason that flota gives and writes nothing', async () => {
    flota.respond('flota', 'GET', '/internal/availability', {
      bus: { available: false, reason: 'IN_WORKSHOP' },
      driver: { available: true },
    });
    const busId = await seedBus(prisma, fleet.branchId);

    const response = await http().post('/trips').set(admin()).send(body({ busId })).expect(409);

    expect(response.body.message).toBe('Ese bus está en taller.');
    expect(await prisma.trip.count({ where: { busId } })).toBe(0);
  });

  it('answers with the friendly text when flota does not answer', async () => {
    flota.respond('flota', 'GET', '/internal/availability', new ServiceUnavailableError());

    const response = await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId: await seedBus(prisma, fleet.branchId) }))
      .expect(503);

    expect(response.body.message).toBe(
      'El servicio no respondió. Intenta de nuevo en unos segundos.',
    );
  });

  it('refuses a retired route without calling flota', async () => {
    await prisma.routeCopy.update({ where: { id: fleet.routeId }, data: { active: false } });

    const response = await http().post('/trips').set(admin()).send(body()).expect(409);

    expect(response.body.message).toBe('Esa ruta está retirada. Reactívala o elige otra.');
    expect(flota.calls).toHaveLength(0);
    await prisma.routeCopy.update({ where: { id: fleet.routeId }, data: { active: true } });
  });

  it('refuses a route of another branch, a deleted route and a departure in the past', async () => {
    const other = await seedFleet(prisma, 'otra sucursal de viajes');
    const own = body({ busId: await seedBus(prisma, fleet.branchId) });

    const foreign = await http()
      .post('/trips')
      .set(admin())
      .send({ ...own, routeId: other.routeId })
      .expect(409);
    expect(foreign.body.message).toBe('Elige una ruta activa que salga de tu sucursal.');

    await prisma.routeCopy.update({ where: { id: other.routeId }, data: { deleted: true } });
    await http()
      .post('/trips')
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN', other.branchId))
      .send(body({ routeId: other.routeId, busId: other.busId, driverId: other.driverId }))
      .expect(409);

    const past = await http()
      .post('/trips')
      .set(admin())
      .send({
        ...own,
        departureAt: '2020-01-01T10:00:00.000Z',
        estimatedArrivalAt: '2020-01-01T14:00:00.000Z',
      })
      .expect(409);
    expect(past.body.message).toBe('La salida debe ser en el futuro.');
  });

  it('says it is still registering a bus or a driver whose copy has not arrived', async () => {
    const noBus = await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId: randomUUID() }))
      .expect(409);
    expect(noBus.body.message).toMatch(/terminando de registrar ese bus/);
    const noDriver = await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId: await seedBus(prisma, fleet.branchId), driverId: randomUUID() }))
      .expect(409);
    expect(noDriver.body.message).toMatch(/terminando de registrar ese chofer/);
  });

  it('lets the database decide when flota said yes but a trip of the bus already crosses', async () => {
    const busId = await seedBus(prisma, fleet.branchId);
    await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId, driverId: await seedDriver(prisma, fleet.branchId) }))
      .expect(201);

    const response = await http()
      .post('/trips')
      .set(admin())
      .send(
        body({
          busId,
          driverId: await seedDriver(prisma, fleet.branchId),
          departureAt: '2030-03-10T14:00:00.000Z',
          estimatedArrivalAt: '2030-03-10T18:00:00.000Z',
        }),
      )
      .expect(409);

    expect(response.body.message).toBe('Ese bus ya tiene un viaje en ese horario.');
    expect(await prisma.trip.count({ where: { busId } })).toBe(1);
  });

  it('refuses a driver who is already in a crossing trip with another bus', async () => {
    const driverId = await seedDriver(prisma, fleet.branchId);
    await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId: await seedBus(prisma, fleet.branchId), driverId }))
      .expect(201);

    const response = await http()
      .post('/trips')
      .set(admin())
      .send(body({ busId: await seedBus(prisma, fleet.branchId), driverId }))
      .expect(409);

    expect(response.body.message).toBe('Ese chofer ya tiene un viaje en ese horario.');
  });

  it('only lets a branch admin in and validates the request', async () => {
    await http()
      .post('/trips')
      .set(identityHeaders(randomUUID(), 'CASHIER', fleet.branchId))
      .send(body())
      .expect(403);
    await http()
      .post('/trips')
      .set(identityHeaders(randomUUID(), 'SYSTEM_ADMIN'))
      .send(body())
      .expect(403);
    await http().post('/trips').send(body()).expect(401);
    await http()
      .post('/trips')
      .set(admin())
      .send(body({ estimatedArrivalAt: window.departureAt }))
      .expect(400);
    await http().post('/trips').set(admin()).send({ routeId: 'x' }).expect(400);
  });
});
