import { randomUUID } from 'node:crypto';
import {
  type FLEET_EXAMPLES,
  createEnvelope,
  exampleBus,
  exampleDriver,
  exampleRoute,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanTripTestData } from './support/cleanup';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

type FleetEvent = keyof typeof FLEET_EXAMPLES;

describe('fleet copies', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;
  let otherId: string;
  // A deleted route is stored with no branches, so the cleanup by branch never finds it.
  const tombstones: string[] = [];

  const send = (type: FleetEvent, payload: unknown, eventId?: string) =>
    request(app.getHttpServer())
      .post('/events/pubsub')
      .send(push({ ...createEnvelope(type, payload, 'c'), ...(eventId && { eventId }) }))
      .expect(204);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'copias de flota');
    otherId = await seedTestBranch(prisma, 'copias de flota destino');
  });
  afterAll(async () => {
    await cleanTripTestData(prisma);
    await prisma.routeCopy.deleteMany({ where: { id: { in: tombstones } } });
    await app.close();
  });

  it('keeps a bus once even if the same event arrives twice', async () => {
    const busId = randomUUID();
    const payload = { ...exampleBus, busId, branchId };
    const eventId = randomUUID();

    await send('BusAdded', payload, eventId);
    await send('BusAdded', payload, eventId);

    expect(await prisma.busCopy.findMany({ where: { id: busId } })).toEqual([
      expect.objectContaining({
        plate: 'C482BTX',
        capacity: 40,
        operationalStatus: 'AVAILABLE',
        active: true,
        version: 1,
      }),
    ]);
  });

  it('keeps a driver once with the day of his licence', async () => {
    const driverId = randomUUID();
    const payload = { ...exampleDriver, driverId, branchId };

    await send('DriverAdded', payload);
    await send('DriverAdded', payload);

    const copy = await prisma.driverCopy.findUnique({ where: { id: driverId } });
    expect(copy).toMatchObject({ fullName: 'Julio Pérez', active: true, version: 1 });
    expect(copy?.licenseExpiresOn.toISOString().slice(0, 10)).toBe('2027-03-01');
    expect(copy?.baseSalary.toNumber()).toBe(350);
  });

  it('keeps a route once with its numbers', async () => {
    const routeId = randomUUID();
    const payload = {
      ...exampleRoute,
      routeId,
      originBranchId: branchId,
      destinationBranchId: otherId,
    };

    await send('RouteCreated', payload);
    await send('RouteCreated', payload);

    const copy = await prisma.routeCopy.findUnique({ where: { id: routeId } });
    expect(copy).toMatchObject({
      originBranchId: branchId,
      active: true,
      deleted: false,
      version: 1,
    });
    expect(copy?.distanceKm.toNumber()).toBe(201.5);
    expect(copy?.ticketPrice.toNumber()).toBe(85);
  });

  it('keeps the newest bus when events arrive out of order', async () => {
    const busId = randomUUID();
    const base = { ...exampleBus, busId, branchId };

    await send('BusDeactivated', { ...base, active: false, assignedDriverId: null, version: 3 });
    await send('BusUpdated', { ...base, mileageKm: 5, version: 2 });
    await send('BusAdded', { ...base, version: 1 });

    expect(await prisma.busCopy.findUnique({ where: { id: busId } })).toMatchObject({
      active: false,
      assignedDriverId: null,
      version: 3,
    });
  });

  it('keeps the newest route and driver when events arrive out of order', async () => {
    const routeId = randomUUID();
    const driverId = randomUUID();
    const route = {
      ...exampleRoute,
      routeId,
      originBranchId: branchId,
      destinationBranchId: otherId,
    };
    const driver = { ...exampleDriver, driverId, branchId };

    await send('RouteUpdated', { ...route, ticketPrice: 90, version: 2 });
    await send('RouteCreated', route);
    await send('DriverUpdated', { ...driver, fullName: 'Nombre nuevo', version: 2 });
    await send('DriverAdded', driver);

    expect(
      (await prisma.routeCopy.findUnique({ where: { id: routeId } }))?.ticketPrice.toNumber(),
    ).toBe(90);
    expect((await prisma.driverCopy.findUnique({ where: { id: driverId } }))?.fullName).toBe(
      'Nombre nuevo',
    );
  });

  it('never revives a deleted route', async () => {
    const routeId = randomUUID();
    tombstones.push(routeId);

    await send('RouteDeleted', { routeId });
    await send('RouteCreated', {
      ...exampleRoute,
      routeId,
      originBranchId: branchId,
      destinationBranchId: otherId,
    });
    await send('RouteUpdated', {
      ...exampleRoute,
      routeId,
      originBranchId: branchId,
      destinationBranchId: otherId,
      version: 5,
    });

    expect(await prisma.routeCopy.findUnique({ where: { id: routeId } })).toMatchObject({
      deleted: true,
      active: false,
    });
  });

  it('turns an existing route into a tombstone when it is deleted', async () => {
    const routeId = randomUUID();
    await send('RouteCreated', {
      ...exampleRoute,
      routeId,
      originBranchId: branchId,
      destinationBranchId: otherId,
    });

    await send('RouteDeleted', { routeId });

    expect(await prisma.routeCopy.findUnique({ where: { id: routeId } })).toMatchObject({
      deleted: true,
      active: false,
    });
  });

  it('keeps the mileage of a bus, so the departure is checked against it', async () => {
    const busId = randomUUID();
    const base = { ...exampleBus, busId, branchId };

    await send('BusAdded', { ...base, mileageKm: 1000 });
    await send('BusUpdated', { ...base, mileageKm: 1450, version: 2 });
    await send('BusUpdated', { ...base, mileageKm: 1200, version: 1 });

    expect((await prisma.busCopy.findUnique({ where: { id: busId } }))?.mileageKm).toBe(1450);
  });

  it('keeps the branches of a deleted route, so the cleanup of test branches finds the tombstone', async () => {
    const routeId = randomUUID();

    await send('RouteDeleted', { routeId, originBranchId: branchId, destinationBranchId: otherId });

    expect(await prisma.routeCopy.findUnique({ where: { id: routeId } })).toMatchObject({
      deleted: true,
      originBranchId: branchId,
      destinationBranchId: otherId,
    });
    await cleanTripTestData(prisma);
    expect(await prisma.routeCopy.count({ where: { id: routeId } })).toBe(0);
  });
});
