import { randomUUID } from 'node:crypto';
import {
  createEnvelope,
  exampleTripCompleted,
  exampleTripDeleted,
  exampleTripDeparted,
  exampleTripScheduled,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { seedBusDriverAndRoute } from './support/fleet';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('trip copies', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;

  const send = (
    type: 'TripScheduled' | 'TripDeleted' | 'TripDeparted' | 'TripCompleted',
    payload: unknown,
  ) =>
    request(app.getHttpServer())
      .post('/events/pubsub')
      .send(push(createEnvelope(type, payload, 'c')))
      .expect(204);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'copias de viajes');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('follows a trip from scheduled to completed and counts it once', async () => {
    const ids = await seedBusDriverAndRoute(prisma, branchId);
    const tripId = randomUUID();
    const common = { tripId, busId: ids.busId, driverId: ids.driverId, branchId };

    await send('TripScheduled', { ...exampleTripScheduled, ...common, routeId: ids.routeId });
    expect(await prisma.route.findUnique({ where: { id: ids.routeId } })).toMatchObject({
      hasTrips: true,
    });
    expect(await prisma.tripCopy.findUnique({ where: { tripId } })).toMatchObject({
      status: 'SCHEDULED',
      busId: ids.busId,
    });

    await send('TripDeparted', { ...exampleTripDeparted, ...common });
    expect(await prisma.bus.findUnique({ where: { id: ids.busId } })).toMatchObject({
      inTransit: true,
    });

    const completed = {
      ...exampleTripCompleted,
      ...common,
      routeId: ids.routeId,
      startMileageKm: 199_800,
      endMileageKm: 200_000,
    };
    await send('TripCompleted', completed);
    // The same trip with a new event id: the status guard keeps the count at one.
    await send('TripCompleted', completed);

    expect(await prisma.bus.findUnique({ where: { id: ids.busId } })).toMatchObject({
      inTransit: false,
      completedTrips: 1,
      mileageKm: 200_000,
    });
    expect(await prisma.driver.findUnique({ where: { id: ids.driverId } })).toMatchObject({
      completedTrips: 1,
    });
    expect(await prisma.tripCopy.findUnique({ where: { tripId } })).toMatchObject({
      status: 'COMPLETED',
    });
  });

  it('never lowers the mileage of a bus', async () => {
    const ids = await seedBusDriverAndRoute(prisma, branchId);
    const tripId = randomUUID();
    await prisma.bus.update({ where: { id: ids.busId }, data: { mileageKm: 500_000 } });

    await send('TripCompleted', {
      ...exampleTripCompleted,
      tripId,
      branchId,
      busId: ids.busId,
      driverId: ids.driverId,
      routeId: ids.routeId,
      startMileageKm: 100,
      endMileageKm: 200,
    });

    expect(await prisma.bus.findUnique({ where: { id: ids.busId } })).toMatchObject({
      mileageKm: 500_000,
      completedTrips: 1,
    });
  });

  it('accepts a departure that arrives before its schedule', async () => {
    const ids = await seedBusDriverAndRoute(prisma, branchId);
    const tripId = randomUUID();
    const common = { tripId, busId: ids.busId, driverId: ids.driverId, branchId };

    await send('TripDeparted', { ...exampleTripDeparted, ...common });
    await send('TripScheduled', { ...exampleTripScheduled, ...common, routeId: ids.routeId });

    const copy = await prisma.tripCopy.findUnique({ where: { tripId } });
    expect(copy).toMatchObject({ status: 'IN_TRANSIT', routeId: ids.routeId });
    // The late schedule gives the copy its real window, so availability still sees the trip.
    expect(copy?.departureAt.toISOString()).toBe(exampleTripScheduled.departureAt);
    expect(copy?.estimatedArrivalAt.toISOString()).toBe(exampleTripScheduled.estimatedArrivalAt);
    expect(await prisma.route.findUnique({ where: { id: ids.routeId } })).toMatchObject({
      hasTrips: true,
    });
    expect(await prisma.bus.findUnique({ where: { id: ids.busId } })).toMatchObject({
      inTransit: true,
    });
  });

  it('forgets a deleted trip that had not started, but not one on the road', async () => {
    const ids = await seedBusDriverAndRoute(prisma, branchId);
    const scheduledId = randomUUID();
    const onTheRoadId = randomUUID();
    const common = { busId: ids.busId, driverId: ids.driverId, branchId };

    await send('TripScheduled', {
      ...exampleTripScheduled,
      ...common,
      tripId: scheduledId,
      routeId: ids.routeId,
    });
    await send('TripDeleted', { ...exampleTripDeleted, ...common, tripId: scheduledId });
    expect(await prisma.tripCopy.findUnique({ where: { tripId: scheduledId } })).toBeNull();

    await send('TripDeparted', { ...exampleTripDeparted, ...common, tripId: onTheRoadId });
    await send('TripDeleted', { ...exampleTripDeleted, ...common, tripId: onTheRoadId });
    expect(await prisma.tripCopy.findUnique({ where: { tripId: onTheRoadId } })).not.toBeNull();
  });

  it('does not bring a trip back when its TripScheduled arrives after its TripDeleted', async () => {
    const ids = await seedBusDriverAndRoute(prisma, branchId);
    const tripId = randomUUID();
    const common = { tripId, busId: ids.busId, driverId: ids.driverId, branchId };

    await send('TripDeleted', { ...exampleTripDeleted, ...common });
    await send('TripScheduled', { ...exampleTripScheduled, ...common, routeId: ids.routeId });

    expect(await prisma.tripCopy.count({ where: { tripId } })).toBe(0);
    expect(await prisma.route.findUnique({ where: { id: ids.routeId } })).toMatchObject({
      hasTrips: false,
    });
  });

  it('does not keep a deleted trip when its TripScheduled and TripDeleted arrive at the same time', async () => {
    const ids = await seedBusDriverAndRoute(prisma, branchId);
    const tripIds = Array.from({ length: 20 }, () => randomUUID());

    await Promise.all(
      tripIds.flatMap((tripId) => {
        const common = { tripId, busId: ids.busId, driverId: ids.driverId, branchId };
        return [
          send('TripScheduled', { ...exampleTripScheduled, ...common, routeId: ids.routeId }),
          send('TripDeleted', { ...exampleTripDeleted, ...common }),
        ];
      }),
    );

    expect(await prisma.tripCopy.count({ where: { tripId: { in: tripIds } } })).toBe(0);
  });

  it('ignores the trips of buses that are not in flota', async () => {
    const tripId = randomUUID();

    await send('TripScheduled', {
      ...exampleTripScheduled,
      tripId,
      busId: randomUUID(),
      driverId: randomUUID(),
      routeId: null,
      branchId,
    });

    expect(await prisma.tripCopy.findUnique({ where: { tripId } })).toBeNull();
  });
});
