import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import {
  createEnvelope,
  exampleBus,
  exampleBranch,
  exampleDriver,
  exampleTripCompleted,
  exampleTripDeleted,
  exampleTripDeparted,
  exampleTripScheduled,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { BranchesHandler } from '../src/common/branches.handler';
import { BranchNames } from '../src/common/branch-names';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FleetCopiesHandler } from '../src/reports/branch-read-model/fleet-copies.handler';
import { TripFactsHandler } from '../src/reports/branch-read-model/trip-facts.handler';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

interface TripRow {
  type: string | null;
  route_id: string | null;
  bus_plate: string | null;
  origin_label: string | null;
  departed_at: Date | null;
  arrived_at: Date | null;
  start_mileage_km: number | null;
  end_mileage_km: number | null;
  fuel_cost: string | null;
  depreciation_per_km: string | null;
  depreciation_amount: string | null;
  deleted_at: Date | null;
}

describe('read model of the fleet and the trips', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: Awaited<ReturnType<typeof startReportes>>['bus'];
  let branchId: string;

  const trip = () => {
    const tripId = randomUUID();
    const ids = { tripId, branchId, busId: randomUUID(), driverId: randomUUID() };
    return {
      ids,
      scheduled: { ...exampleTripScheduled, ...ids },
      departed: { ...exampleTripDeparted, ...ids },
      completed: { ...exampleTripCompleted, ...ids },
      deleted: { ...exampleTripDeleted, ...ids },
    };
  };
  const tripRows = (tripId: string) =>
    prisma.$queryRawUnsafe<TripRow[]>(
      'SELECT * FROM branch_report_trips WHERE id = $1::uuid',
      tripId,
    );

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'read model de flota');
  });
  afterAll(async () => {
    try {
      await cleanReportesTestData(prisma, [branchId]);
    } finally {
      await app.close();
    }
  });

  it('keeps version 2 of a bus even when it arrives before version 1', async () => {
    const busId = randomUUID();
    const snapshot = { ...exampleBus, busId, branchId };

    await bus.deliver('BusUpdated', { ...snapshot, mileageKm: 150000, version: 2 });
    await bus.deliver('BusAdded', { ...snapshot, version: 1 });

    expect(await prisma.branchReportBus.findUnique({ where: { id: busId } })).toMatchObject({
      mileageKm: 150000,
      version: 2,
    });
  });

  it('completes a trip that started with its departure when the schedule arrives later', async () => {
    const { ids, scheduled, departed } = trip();

    await bus.deliver('TripDeparted', departed);
    const [early] = await tripRows(ids.tripId);
    expect(early).toMatchObject({ bus_plate: null, route_id: null, start_mileage_km: 148410 });
    expect(early?.departed_at?.toISOString()).toBe(departed.departedAt);

    await bus.deliver('TripScheduled', scheduled);

    const rows = await tripRows(ids.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'REGULAR',
      route_id: scheduled.routeId,
      bus_plate: 'C482BTX',
      origin_label: 'Quetzaltenango',
      start_mileage_km: 148410,
    });
    expect(rows[0]?.departed_at?.toISOString()).toBe(departed.departedAt);
  });

  it('fixes the arrival, the mileage and the amounts, once even if delivered twice', async () => {
    const { ids, completed } = trip();
    const eventId = randomUUID();

    await bus.deliver('TripCompleted', completed, { eventId });
    await bus.deliver('TripCompleted', completed, { eventId });

    const rows = await tripRows(ids.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'REGULAR',
      start_mileage_km: 148410,
      end_mileage_km: 148612,
    });
    expect(rows[0]?.arrived_at?.toISOString()).toBe(completed.arrivedAt);
    expect(Number(rows[0]?.fuel_cost)).toBe(1250);
    expect(Number(rows[0]?.depreciation_per_km)).toBe(1.5);
    expect(Number(rows[0]?.depreciation_amount)).toBe(303);
    expect(await prisma.processedEvent.count({ where: { eventId } })).toBe(1);
  });

  it('keeps a deleted trip as a tombstone that a late schedule does not bring back', async () => {
    const { ids, scheduled, deleted } = trip();

    await bus.deliver('TripDeleted', deleted);
    await bus.deliver('TripScheduled', scheduled);

    const rows = await tripRows(ids.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
    expect(rows[0]).toMatchObject({ bus_plate: 'C482BTX' });
  });

  it('marks a trip deleted after its facts were recorded', async () => {
    const { ids, scheduled, deleted } = trip();

    await bus.deliver('TripScheduled', scheduled);
    await bus.deliver('TripDeleted', deleted);

    expect((await tripRows(ids.tripId))[0]?.deleted_at).toBeInstanceOf(Date);
  });

  it('folds the search text of a bus and of a driver', async () => {
    const busId = randomUUID();
    const driverId = randomUUID();

    await bus.deliver('BusAdded', {
      ...exampleBus,
      busId,
      branchId,
      plate: 'P-123 ABC',
      brand: 'Volvó',
      model: 'B12M',
    });
    await bus.deliver('DriverAdded', {
      ...exampleDriver,
      driverId,
      branchId,
      fullName: 'José Núñez',
      licenseNumber: 'GT12345',
    });

    const busCopy = await prisma.branchReportBus.findUniqueOrThrow({ where: { id: busId } });
    const driverCopy = await prisma.branchReportDriver.findUniqueOrThrow({
      where: { id: driverId },
    });
    expect(busCopy.searchText).toContain('p123abc volvo b12m');
    expect(driverCopy.searchText).toContain('jose nunez gt12345');
  });

  it('keeps the day of the licence of a driver and replaces it with a newer version', async () => {
    const driverId = randomUUID();
    const snapshot = { ...exampleDriver, driverId, branchId };

    await bus.deliver('DriverAdded', snapshot);
    await bus.deliver('DriverUpdated', { ...snapshot, licenseExpiresOn: '2028-03-01', version: 2 });
    await bus.deliver('DriverAdded', snapshot);

    const copy = await prisma.branchReportDriver.findUniqueOrThrow({ where: { id: driverId } });
    expect(copy.licenseExpiresOn.toISOString().slice(0, 10)).toBe('2028-03-01');
    expect(copy.version).toBe(2);
  });

  it('marks a bus inactive with its deactivation', async () => {
    const busId = randomUUID();
    const snapshot = { ...exampleBus, busId, branchId };

    await bus.deliver('BusAdded', snapshot);
    await bus.deliver('BusDeactivated', {
      ...snapshot,
      active: false,
      assignedDriverId: null,
      version: 2,
    });

    expect(await prisma.branchReportBus.findUnique({ where: { id: busId } })).toMatchObject({
      active: false,
      assignedDriverId: null,
      version: 2,
    });
  });

  it('answers the name of a branch from its copy, and null for an unknown one', async () => {
    const names = app.get(BranchNames);

    expect(await names.nameOf(branchId)).toContain('read model de flota');
    expect(await names.nameOf(randomUUID())).toBeNull();
  });

  it('writes through the service client when a handler runs outside the inbox transaction', async () => {
    const envelope = createEnvelope('BusAdded', {}, 'c');
    const { ids, scheduled, departed, completed, deleted } = trip();
    const busId = randomUUID();
    const driverId = randomUUID();
    const direct = {
      fleet: app.get(FleetCopiesHandler),
      trips: app.get(TripFactsHandler),
      branches: app.get(BranchesHandler),
    };

    await direct.fleet.busAdded({ ...exampleBus, busId, branchId }, envelope);
    await direct.fleet.driverAdded({ ...exampleDriver, driverId, branchId }, envelope);
    await direct.trips.tripScheduled(scheduled, envelope);
    await direct.trips.tripDeparted(departed, envelope);
    await direct.trips.tripCompleted(completed, envelope);
    await direct.trips.tripDeleted(deleted, envelope);
    const name = `${TEST_BRANCH_PREFIX}${TEST_RUN} renombrada`;
    await direct.branches.updated({ ...exampleBranch, branchId, name, version: 5 }, envelope);

    expect(await prisma.branchReportBus.count({ where: { id: busId } })).toBe(1);
    expect(await prisma.branchReportDriver.count({ where: { id: driverId } })).toBe(1);
    const [row] = await tripRows(ids.tripId);
    expect(row).toMatchObject({ bus_plate: 'C482BTX', end_mileage_km: 148612 });
    expect(row?.deleted_at).toBeInstanceOf(Date);
    expect(await prisma.branchCopy.findUnique({ where: { id: branchId } })).toMatchObject({
      name,
      version: 5,
    });
  });
});
