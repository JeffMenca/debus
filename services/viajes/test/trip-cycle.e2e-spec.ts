import { randomUUID } from 'node:crypto';
import {
  MAX_TRIP_DISTANCE_KM,
  tripCompletedPayloadSchema,
  tripDeletedPayloadSchema,
  tripDepartedPayloadSchema,
  tripDetailSchema,
  todayInGuatemala,
} from '@debus/contracts';
import { FakeServiceClient, identityHeaders, ServiceHttpClient } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTripTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { type SeededFleet, seedBus, seedDriver, seedFleet } from './support/fleet';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const hoursAhead = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const SIMULTANEOUS = 10;

describe('trip cycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let fleet: SeededFleet;
  const versionIds: string[] = [];
  const flota = new FakeServiceClient();
  const adminId = randomUUID();
  const http = () => request(app.getHttpServer());
  const admin = () => identityHeaders(adminId, 'BRANCH_ADMIN', fleet.branchId);
  const driver = (driverId: string) => identityHeaders(driverId, 'DRIVER', fleet.branchId);
  // A trip leaves soon, as the trips whose departure is recorded do. Each one gets its own bus and
  // driver unless the test hands them over, so trips never cross each other.
  const scheduleTrip = async (
    over: {
      busId?: string;
      driverId?: string;
      departureAt?: string;
      estimatedArrivalAt?: string;
    } = {},
  ) => {
    const busId = over.busId ?? (await seedBus(prisma, fleet.branchId));
    const driverId = over.driverId ?? (await seedDriver(prisma, fleet.branchId));
    const response = await http()
      .post('/trips')
      .set(admin())
      .send({
        routeId: fleet.routeId,
        busId,
        driverId,
        departureAt: over.departureAt ?? hoursAhead(0.2),
        estimatedArrivalAt: over.estimatedArrivalAt ?? hoursAhead(4.2),
      })
      .expect(201);
    return { tripId: response.body.id as string, busId, driverId };
  };
  const getDetail = async (tripId: string) =>
    tripDetailSchema.parse((await http().get(`/trips/${tripId}`).set(admin()).expect(200)).body);
  const addRate = async (depreciationPerKm: number, createdAt: string) => {
    const id = randomUUID();
    versionIds.push(id);
    await prisma.settingsVersionCopy.create({
      data: {
        id,
        depreciationPerKm,
        rentalRatePerKm: 12,
        effectiveFrom: new Date(`${todayInGuatemala()}T00:00:00.000Z`),
        createdAt: new Date(createdAt),
      },
    });
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ServiceHttpClient).useValue(flota),
    );
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    fleet = await seedFleet(prisma, 'ciclo');
    flota.respond('flota', 'GET', '/internal/availability', {
      bus: { available: true },
      driver: { available: true },
    });
    // The newest version of today wins, whatever else the local database already has.
    await addRate(0.85, '2098-01-01T00:00:00.000Z');
  });

  afterAll(async () => {
    try {
      await prisma.settingsVersionCopy.deleteMany({ where: { id: { in: versionIds } } });
      await cleanTripTestData(prisma);
    } finally {
      await app.close();
    }
  });

  describe('a trip from departure to arrival', () => {
    let tripId: string;
    let driverId: string;

    beforeAll(async () => {
      ({ tripId, driverId } = await scheduleTrip());
    });

    it('records the departure, then the arrival by the driver, fixing the amounts', async () => {
      const departure = await http()
        .post(`/trips/${tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(240), startMileageKm: 1000 })
        .expect(201);
      expect(tripDetailSchema.parse(departure.body)).toMatchObject({
        status: 'IN_TRANSIT',
        canDelete: false,
        departure: { startMileageKm: 1000, recordedByRole: 'BRANCH_ADMIN' },
        arrival: null,
      });

      const arrival = await http()
        .post(`/trips/${tripId}/arrival`)
        .set(driver(driverId))
        .send({ arrivedAt: minutesAgo(5), endMileageKm: 1204, fuelCost: 1180 })
        .expect(201);
      expect(tripDetailSchema.parse(arrival.body)).toMatchObject({
        status: 'COMPLETED',
        arrival: {
          distanceKm: 204,
          depreciationPerKm: 0.85,
          depreciationAmount: 173.4,
          driverPay: 300,
          fuelCost: 1180,
          recordedByRole: 'DRIVER',
        },
      });
    });

    it('publishes TripScheduled, TripDeparted and TripCompleted, each valid for its contract', async () => {
      expect(await events.typesFor(tripId)).toEqual([
        'TripScheduled',
        'TripDeparted',
        'TripCompleted',
      ]);
      const [departed] = await events.committed('TripDeparted');
      expect(tripDepartedPayloadSchema.safeParse(departed).success).toBe(true);
      const completed = (await events.committed('TripCompleted')).map((payload) =>
        tripCompletedPayloadSchema.parse(payload),
      );
      expect(completed).toContainEqual(
        expect.objectContaining({
          tripId,
          startMileageKm: 1000,
          endMileageKm: 1204,
          depreciationAmount: 173.4,
          driverPay: 300,
        }),
      );
    });

    it('keeps the fixed amounts after the rate changes', async () => {
      await addRate(3, '2098-06-01T00:00:00.000Z');

      const detail = await getDetail(tripId);

      expect(detail.arrival?.depreciationAmount).toBe(173.4);
      expect(detail.arrival?.depreciationPerKm).toBe(0.85);
      expect(detail.depreciationPerKmToday).toBe(3);
    });

    it('refuses to record either of them a second time', async () => {
      const departure = await http()
        .post(`/trips/${tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(10), startMileageKm: 1300 })
        .expect(409);
      expect(departure.body.message).toBe('La salida de este viaje ya fue registrada.');
      const arrival = await http()
        .post(`/trips/${tripId}/arrival`)
        .set(admin())
        .send({ arrivedAt: minutesAgo(1), endMileageKm: 1500, fuelCost: 10 })
        .expect(409);
      expect(arrival.body.message).toBe('La llegada de este viaje ya fue registrada.');
    });

    it('has no route to change or delete a departure or an arrival', async () => {
      for (const part of ['departure', 'arrival']) {
        for (const method of ['put', 'patch', 'delete'] as const) {
          await http()[method](`/trips/${tripId}/${part}`).set(admin()).expect(404);
        }
      }
    });

    it('refuses to delete a trip that left, and its records stay', async () => {
      const response = await http().delete(`/trips/${tripId}`).set(admin()).expect(409);

      expect(response.body.message).toBe(
        'Este viaje ya salió. Solo se eliminan viajes que no han salido.',
      );
      expect(await prisma.tripDeparture.count({ where: { tripId } })).toBe(1);
      expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(1);
    });
  });

  it('lets exactly one of ten simultaneous departures win', async () => {
    const { tripId } = await scheduleTrip();

    const results = await Promise.all(
      Array.from({ length: SIMULTANEOUS }, () =>
        http()
          .post(`/trips/${tripId}/departure`)
          .set(admin())
          .send({ departedAt: minutesAgo(1), startMileageKm: 1000 }),
      ),
    );

    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(SIMULTANEOUS - 1);
    expect(await prisma.tripDeparture.count({ where: { tripId } })).toBe(1);
    expect((await events.typesFor(tripId)).filter((type) => type === 'TripDeparted')).toHaveLength(
      1,
    );
  });

  it('refuses an arrival before the departure and the ones that do not add up', async () => {
    const { tripId } = await scheduleTrip();
    const arrive = (body: object) =>
      http().post(`/trips/${tripId}/arrival`).set(admin()).send(body);

    const early = await arrive({ arrivedAt: minutesAgo(1), endMileageKm: 1100, fuelCost: 10 });
    expect(early.status).toBe(409);
    expect(early.body.message).toBe('Primero registra la salida de este viaje.');

    await http()
      .post(`/trips/${tripId}/departure`)
      .set(admin())
      .send({ departedAt: minutesAgo(60), startMileageKm: 1000 })
      .expect(201);

    const before = await arrive({ arrivedAt: minutesAgo(61), endMileageKm: 1100, fuelCost: 10 });
    expect(before.body.message).toBe('La llegada debe ser después de la salida.');
    const future = await arrive({
      arrivedAt: new Date(Date.now() + 3_600_000).toISOString(),
      endMileageKm: 1100,
      fuelCost: 10,
    });
    expect(future.body.message).toBe('La hora real de llegada no puede ser en el futuro.');
    const lower = await arrive({ arrivedAt: minutesAgo(1), endMileageKm: 999, fuelCost: 10 });
    expect(lower.body.message).toBe('El kilometraje final no puede ser menor que el inicial.');
    await arrive({ arrivedAt: minutesAgo(1), endMileageKm: 1100 }).then((r) =>
      expect(r.status).toBe(400),
    );
    expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(0);
  });

  it('refuses a departure below the mileage of the bus, in the future, or with a bad body', async () => {
    const { tripId } = await scheduleTrip();
    const depart = (body: object) =>
      http().post(`/trips/${tripId}/departure`).set(admin()).send(body);

    const low = await depart({ departedAt: minutesAgo(1), startMileageKm: 999 });
    expect(low.status).toBe(409);
    expect(low.body.message).toBe(
      'El kilometraje inicial no puede ser menor que el último registrado del bus.',
    );
    const future = await depart({
      departedAt: new Date(Date.now() + 3_600_000).toISOString(),
      startMileageKm: 1000,
    });
    expect(future.body.message).toBe('La hora real de salida no puede ser en el futuro.');
    expect((await depart({ departedAt: 'ayer', startMileageKm: 1000 })).status).toBe(400);
    expect((await depart({ departedAt: minutesAgo(1), startMileageKm: -1 })).status).toBe(400);
    expect(await prisma.tripDeparture.count({ where: { tripId } })).toBe(0);
  });

  it('refuses the arrival when no depreciation amount is in force that day', async () => {
    const { tripId } = await scheduleTrip();
    // A departure long before any amount existed, which the API itself would not accept.
    await prisma.tripDeparture.create({
      data: {
        tripId,
        departedAt: new Date('1999-12-30T12:00:00.000Z'),
        startMileageKm: 1000,
        recordedById: adminId,
        recordedByRole: 'BRANCH_ADMIN',
      },
    });
    await prisma.trip.update({ where: { id: tripId }, data: { status: 'IN_TRANSIT' } });

    const response = await http()
      .post(`/trips/${tripId}/arrival`)
      .set(admin())
      .send({ arrivedAt: '1999-12-31T12:00:00.000Z', endMileageKm: 1100, fuelCost: 10 });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/monto de depreciación vigente/);
    expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(0);
  });

  it('answers 404, not a missing amount, for a trip that does not exist', async () => {
    const response = await http()
      .post(`/trips/${randomUUID()}/arrival`)
      .set(admin())
      .send({ arrivedAt: '1999-12-31T12:00:00.000Z', endMileageKm: 1100, fuelCost: 10 });

    expect(response.status).toBe(404);
  });

  describe('the mileage of a bus that already made a trip', () => {
    it('starts the second trip from the arrival of the first, even when the copy of the bus never heard of it', async () => {
      const first = await scheduleTrip();
      await http()
        .post(`/trips/${first.tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(240), startMileageKm: 1000 })
        .expect(201);
      await http()
        .post(`/trips/${first.tripId}/arrival`)
        .set(driver(first.driverId))
        .send({ arrivedAt: minutesAgo(5), endMileageKm: 1204, fuelCost: 1180 })
        .expect(201);
      // flota raises its mileage when it hears TripCompleted and says nothing else: the copy stays at 1000.
      expect(
        (await prisma.busCopy.findUniqueOrThrow({ where: { id: first.busId } })).mileageKm,
      ).toBe(1000);
      const second = await scheduleTrip({
        busId: first.busId,
        driverId: first.driverId,
        departureAt: hoursAhead(5),
        estimatedArrivalAt: hoursAhead(9),
      });

      expect((await getDetail(second.tripId)).suggestedStartMileageKm).toBe(1204);
      const low = await http()
        .post(`/trips/${second.tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(1), startMileageKm: 1100 })
        .expect(409);
      expect(low.body.message).toBe(
        'El kilometraje inicial no puede ser menor que el último registrado del bus.',
      );
      expect(await prisma.tripDeparture.count({ where: { tripId: second.tripId } })).toBe(0);

      await http()
        .post(`/trips/${second.tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(1), startMileageKm: 1204 })
        .expect(201);
    });

    it('keeps the higher mileage when the bus was edited above its last arrival', async () => {
      const first = await scheduleTrip();
      await http()
        .post(`/trips/${first.tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(240), startMileageKm: 1000 })
        .expect(201);
      await http()
        .post(`/trips/${first.tripId}/arrival`)
        .set(admin())
        .send({ arrivedAt: minutesAgo(5), endMileageKm: 1204, fuelCost: 1180 })
        .expect(201);
      await prisma.busCopy.update({
        where: { id: first.busId },
        data: { mileageKm: 1500, version: { increment: 1 } },
      });
      const second = await scheduleTrip({
        busId: first.busId,
        driverId: first.driverId,
        departureAt: hoursAhead(5),
        estimatedArrivalAt: hoursAhead(9),
      });

      expect((await getDetail(second.tripId)).suggestedStartMileageKm).toBe(1500);
    });
  });

  describe('an event that its own contract would reject', () => {
    const onTheRoad = async () => {
      const trip = await scheduleTrip();
      await http()
        .post(`/trips/${trip.tripId}/departure`)
        .set(admin())
        .send({ departedAt: minutesAgo(240), startMileageKm: 1000 })
        .expect(201);
      return trip;
    };

    it('refuses an arrival with a distance no trip could cover, and records nothing', async () => {
      const { tripId } = await onTheRoad();
      const eventsBefore = await events.typesFor(tripId);

      const response = await http()
        .post(`/trips/${tripId}/arrival`)
        .set(admin())
        .send({ arrivedAt: minutesAgo(5), endMileageKm: 148_410 * 10, fuelCost: 1180 })
        .expect(409);

      expect(response.body.message).toMatch(/demasiado alto para un solo viaje/);
      expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(0);
      expect((await getDetail(tripId)).status).toBe('IN_TRANSIT');
      expect(await events.typesFor(tripId)).toEqual(eventsBefore);
    });

    it('refuses an arrival whose depreciation would not fit TripCompleted, and records nothing', async () => {
      const { tripId } = await onTheRoad();
      await addRate(100_000, '2099-01-01T00:00:00.000Z');

      try {
        const response = await http()
          .post(`/trips/${tripId}/arrival`)
          .set(admin())
          .send({ arrivedAt: minutesAgo(5), endMileageKm: 1100, fuelCost: 1180 })
          .expect(409);

        expect(response.body.message).toMatch(/depreciación de este viaje sale demasiado alta/);
        expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(0);
      } finally {
        await prisma.settingsVersionCopy.deleteMany({ where: { id: versionIds.pop() } });
      }
    });

    it('accepts a distance exactly as long as the limit', async () => {
      const { tripId } = await onTheRoad();

      await http()
        .post(`/trips/${tripId}/arrival`)
        .set(admin())
        .send({ arrivedAt: minutesAgo(5), endMileageKm: 1000 + MAX_TRIP_DISTANCE_KM, fuelCost: 10 })
        .expect(201);
    });
  });

  it('refuses to fix the pay of a driver whose salary is unknown', async () => {
    const { tripId, driverId } = await scheduleTrip();
    await http()
      .post(`/trips/${tripId}/departure`)
      .set(admin())
      .send({ departedAt: minutesAgo(240), startMileageKm: 1000 })
      .expect(201);
    await prisma.driverCopy.delete({ where: { id: driverId } });

    const response = await http()
      .post(`/trips/${tripId}/arrival`)
      .set(admin())
      .send({ arrivedAt: minutesAgo(5), endMileageKm: 1100, fuelCost: 10 })
      .expect(409);

    expect(response.body.message).toBe(
      'Aún no tenemos el salario de ese chofer. Intenta de nuevo en unos segundos.',
    );
    expect(await prisma.tripArrival.count({ where: { tripId } })).toBe(0);
  });

  it('refuses a departure recorded days before the scheduled one', async () => {
    const { tripId } = await scheduleTrip({
      departureAt: hoursAhead(7 * 24),
      estimatedArrivalAt: hoursAhead(7 * 24 + 4),
    });

    const response = await http()
      .post(`/trips/${tripId}/departure`)
      .set(admin())
      .send({ departedAt: minutesAgo(1), startMileageKm: 1000 })
      .expect(409);

    expect(response.body.message).toMatch(/12 horas de anticipación/);
    expect(await prisma.tripDeparture.count({ where: { tripId } })).toBe(0);
  });

  it('deletes a trip that has not left and publishes TripDeleted', async () => {
    const { tripId } = await scheduleTrip();

    await http().delete(`/trips/${tripId}`).set(admin()).expect(204);

    expect(await prisma.trip.count({ where: { id: tripId } })).toBe(0);
    expect(await events.typesFor(tripId)).toEqual(['TripScheduled', 'TripDeleted']);
    const deleted = (await events.committed('TripDeleted')).map((payload) =>
      tripDeletedPayloadSchema.parse(payload),
    );
    expect(deleted).toContainEqual(expect.objectContaining({ tripId, type: 'REGULAR' }));
    await http().get(`/trips/${tripId}`).set(admin()).expect(404);
  });

  it('does not let a driver delete, nor touch the trip of another driver', async () => {
    const { tripId, driverId } = await scheduleTrip();

    await http().delete(`/trips/${tripId}`).set(driver(driverId)).expect(403);
    await http()
      .post(`/trips/${tripId}/departure`)
      .set(driver(randomUUID()))
      .send({ departedAt: minutesAgo(1), startMileageKm: 1000 })
      .expect(404);
    await http().get(`/trips/${tripId}`).set(driver(randomUUID())).expect(404);
    await http().get(`/trips/${tripId}`).set(driver(driverId)).expect(200);
    await http()
      .post(`/trips/${tripId}/departure`)
      .set(driver(driverId))
      .send({ departedAt: minutesAgo(1), startMileageKm: 1000 })
      .expect(201);
    expect(
      (await prisma.tripDeparture.findUniqueOrThrow({ where: { tripId } })).recordedByRole,
    ).toBe('DRIVER');
  });

  it('shows a driver only their own trips, and a branch admin the trips of the branch', async () => {
    const mine = await scheduleTrip();
    const other = await scheduleTrip();

    const driverList = await http().get('/trips').set(driver(mine.driverId)).expect(200);
    const adminList = await http().get('/trips?pageSize=100').set(admin()).expect(200);

    expect(driverList.body.items.map((trip: { id: string }) => trip.id)).toEqual([mine.tripId]);
    const ids = adminList.body.items.map((trip: { id: string }) => trip.id);
    expect(ids).toEqual(expect.arrayContaining([mine.tripId, other.tripId]));
    await http()
      .get('/trips')
      .set(identityHeaders(randomUUID(), 'CASHIER', fleet.branchId))
      .expect(403);
  });

  it('refuses the departure of a trip whose bus was deactivated after it was scheduled', async () => {
    const { tripId, busId } = await scheduleTrip();
    await prisma.busCopy.update({
      where: { id: busId },
      data: { active: false, version: { increment: 1 } },
    });

    const detail = await getDetail(tripId);
    expect(detail.busActive).toBe(false);
    const response = await http()
      .post(`/trips/${tripId}/departure`)
      .set(admin())
      .send({ departedAt: minutesAgo(1), startMileageKm: 1000 })
      .expect(409);

    expect(response.body.message).toContain('Elimina el viaje');
    expect(await prisma.tripDeparture.count({ where: { tripId } })).toBe(0);
  });
});
