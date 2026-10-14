import { randomUUID } from 'node:crypto';
import { exampleBus, exampleDriver, exampleTripCompleted } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

describe('cleaning the test data of reportes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: Awaited<ReturnType<typeof startReportes>>['bus'];
  const realBranchId = randomUUID();
  const realBusId = randomUUID();

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
  });
  afterAll(async () => {
    await prisma.branchReportBus.deleteMany({ where: { id: realBusId } });
    await app.close();
  });

  it('removes the read model of the test branches and keeps what belongs to a real one', async () => {
    const branchId = await seedTestBranch(bus, 'limpieza');
    const busId = randomUUID();
    const driverId = randomUUID();
    const tripId = randomUUID();
    await bus.deliver('BusAdded', { ...exampleBus, busId, branchId });
    await bus.deliver('DriverAdded', { ...exampleDriver, driverId, branchId });
    await bus.deliver('TripCompleted', {
      ...exampleTripCompleted,
      tripId,
      branchId,
      busId,
      driverId,
    });
    await bus.deliver('BusAdded', { ...exampleBus, busId: realBusId, branchId: realBranchId });

    await cleanReportesTestData(prisma);

    expect(await prisma.branchReportBus.count({ where: { id: busId } })).toBe(0);
    expect(await prisma.branchReportDriver.count({ where: { id: driverId } })).toBe(0);
    expect(await prisma.branchReportTrip.count({ where: { id: tripId } })).toBe(0);
    expect(await prisma.branchCopy.count({ where: { id: branchId } })).toBe(0);
    expect(await prisma.branchReportBus.count({ where: { id: realBusId } })).toBe(1);
  });
});
