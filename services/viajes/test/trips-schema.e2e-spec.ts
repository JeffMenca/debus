import { randomUUID } from 'node:crypto';
import { isConstraintViolation } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanTripTestData } from './support/cleanup';
import { arrivalOf, departureOf } from './support/trip-records';

// What the database answers when it refuses; `undefined` if it accepted.
async function refusal(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('trips schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;
  let busId: string;
  let driverId: string;

  const trip = (over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    type: 'REGULAR' as const,
    status: 'SCHEDULED' as const,
    branchId,
    busId,
    busPlate: 'Z100BCD',
    capacity: 40,
    driverId,
    driverName: 'Ana Sic',
    originLabel: 'Prueba A',
    destinationLabel: 'Prueba B',
    departureAt: new Date('2030-01-10T12:00:00Z'),
    estimatedArrivalAt: new Date('2030-01-10T16:00:00Z'),
    ticketPrice: 85,
    createdById: randomUUID(),
    ...over,
  });
  const completedTrip = (over: Record<string, unknown> = {}) =>
    trip({
      status: 'COMPLETED',
      departure: { create: departureOf() },
      arrival: { create: arrivalOf() },
      ...over,
    });
  const at = (from: string, to: string) => ({
    departureAt: new Date(`2030-01-10T${from}:00Z`),
    estimatedArrivalAt: new Date(`2030-01-10T${to}:00Z`),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'esquema de viajes');
  });
  beforeEach(() => {
    busId = randomUUID();
    driverId = randomUUID();
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await app.close();
  });

  it('refuses a second trip of the same bus that crosses the first', async () => {
    await prisma.trip.create({ data: trip() });

    const error = await refusal(
      prisma.trip.create({ data: trip({ driverId: randomUUID(), ...at('15:00', '18:00') }) }),
    );

    expect(isConstraintViolation(error, 'trips_bus_no_overlap')).toBe(true);
  });

  it('accepts a trip that starts when the previous one arrives', async () => {
    await prisma.trip.create({ data: trip() });

    await expect(
      prisma.trip.create({ data: trip({ driverId: randomUUID(), ...at('16:00', '19:00') }) }),
    ).resolves.toBeDefined();
  });

  it('refuses the same driver in two crossing trips of different buses', async () => {
    await prisma.trip.create({ data: trip() });

    const error = await refusal(
      prisma.trip.create({ data: trip({ busId: randomUUID(), ...at('14:00', '17:00') }) }),
    );

    expect(isConstraintViolation(error, 'trips_driver_no_overlap')).toBe(true);
  });

  it('lets different buses and drivers share the same hours', async () => {
    await prisma.trip.create({ data: trip() });

    await expect(
      prisma.trip.create({ data: trip({ busId: randomUUID(), driverId: randomUUID() }) }),
    ).resolves.toBeDefined();
  });

  it('lets the bus and the driver of a trip that arrived take a trip inside its hours', async () => {
    await prisma.trip.create({ data: completedTrip() });

    await expect(prisma.trip.create({ data: trip(at('13:00', '15:00')) })).resolves.toBeDefined();
  });

  it.each([
    ['bus', 'driverId', 'trips_bus_no_overlap'],
    ['driver', 'busId', 'trips_driver_no_overlap'],
  ] as const)(
    'still refuses the %s of a trip that crosses one on the road',
    async (_shared, other, constraint) => {
      await prisma.trip.create({
        data: trip({ status: 'IN_TRANSIT', departure: { create: departureOf() } }),
      });

      const error = await refusal(
        prisma.trip.create({ data: trip({ [other]: randomUUID(), ...at('13:00', '15:00') }) }),
      );

      expect(isConstraintViolation(error, constraint)).toBe(true);
    },
  );

  it('never moves a trip back, so a completed trip cannot hold its bus again', async () => {
    const done = await prisma.trip.create({ data: completedTrip() });
    await prisma.trip.create({ data: trip(at('13:00', '15:00')) });

    await expect(
      prisma.trip.update({ where: { id: done.id }, data: { status: 'SCHEDULED' } }),
    ).rejects.toThrow(/only moves forward/);
  });

  it('puts a trip on the road only with its departure, and completes it only with its arrival', async () => {
    const planned = await prisma.trip.create({ data: trip() });

    await expect(
      prisma.trip.update({ where: { id: planned.id }, data: { status: 'IN_TRANSIT' } }),
    ).rejects.toThrow(/departure recorded/);
    await expect(
      prisma.trip.update({ where: { id: planned.id }, data: { status: 'COMPLETED' } }),
    ).rejects.toThrow(/arrival recorded/);
  });

  it('lets the status move forward once the record exists', async () => {
    const planned = await prisma.trip.create({ data: trip() });
    await prisma.tripDeparture.create({ data: { tripId: planned.id, ...departureOf() } });
    await expect(
      prisma.trip.update({ where: { id: planned.id }, data: { status: 'IN_TRANSIT' } }),
    ).resolves.toMatchObject({ status: 'IN_TRANSIT' });

    await prisma.tripArrival.create({ data: { tripId: planned.id, ...arrivalOf() } });
    await expect(
      prisma.trip.update({ where: { id: planned.id }, data: { status: 'COMPLETED' } }),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('never changes the type of a trip', async () => {
    const created = await prisma.trip.create({ data: trip() });

    await expect(
      prisma.trip.update({ where: { id: created.id }, data: { type: 'RENTAL' } }),
    ).rejects.toThrow(/type of a trip cannot change/);
  });

  it('needs the arrival after the departure', async () => {
    const error = await refusal(
      prisma.trip.create({
        data: trip({
          departureAt: new Date('2030-01-10T12:00:00Z'),
          estimatedArrivalAt: new Date('2030-01-10T12:00:00Z'),
        }),
      }),
    );

    expect(isConstraintViolation(error, 'trips_arrival_after_departure')).toBe(true);
  });

  it('keeps an accent-free search text of the route, the bus and the driver', async () => {
    const created = await prisma.trip.create({
      data: trip({
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Petén',
        driverName: 'José Ángel',
      }),
    });

    expect(created.searchText).toContain('peten');
    expect(created.searchText).toContain('jose angel');
    expect(created.searchText).toContain('z100bcd');
  });
});
