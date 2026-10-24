import { randomUUID } from 'node:crypto';
import { exampleRoute, exampleRouteDeleted } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

describe('read model of the routes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: Awaited<ReturnType<typeof startReportes>>['bus'];
  let originId: string;
  let destinationId: string;
  const routeIds: string[] = [];

  const route = () => {
    const routeId = randomUUID();
    routeIds.push(routeId);
    return {
      routeId,
      snapshot: {
        ...exampleRoute,
        routeId,
        originBranchId: originId,
        destinationBranchId: destinationId,
      },
      deleted: {
        ...exampleRouteDeleted,
        routeId,
        originBranchId: originId,
        destinationBranchId: destinationId,
      },
    };
  };
  const rowOf = (routeId: string) =>
    prisma.systemReportRoute.findUnique({ where: { id: routeId } });

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    originId = await seedTestBranch(bus, 'rutas origen');
    destinationId = await seedTestBranch(bus, 'rutas destino');
  });
  afterAll(async () => {
    try {
      await prisma.systemReportRoute.deleteMany({ where: { id: { in: routeIds } } });
      await cleanReportesTestData(prisma, [originId, destinationId]);
    } finally {
      await app.close();
    }
  });

  it('keeps the route of a RouteCreated with its fields', async () => {
    const { routeId, snapshot } = route();

    await bus.deliver('RouteCreated', snapshot);

    const row = await rowOf(routeId);
    expect(row).toMatchObject({
      originBranchId: originId,
      destinationBranchId: destinationId,
      active: true,
      version: 1,
      deletedAt: null,
    });
    expect(Number(row?.distanceKm)).toBe(201.5);
    expect(Number(row?.ticketPrice)).toBe(85);
  });

  it('changes nothing when the very same event is delivered twice', async () => {
    const { routeId, snapshot } = route();
    const eventId = randomUUID();

    await bus.deliver('RouteCreated', snapshot, { eventId });
    const first = await rowOf(routeId);
    await bus.deliver('RouteCreated', { ...snapshot, ticketPrice: 999 }, { eventId });

    expect(await rowOf(routeId)).toEqual(first);
    expect(await prisma.processedEvent.count({ where: { eventId } })).toBe(1);
  });

  it('keeps version 2 even when RouteUpdated arrives before RouteCreated', async () => {
    const { routeId, snapshot } = route();

    await bus.deliver('RouteUpdated', { ...snapshot, ticketPrice: 90, version: 2 });
    await bus.deliver('RouteCreated', { ...snapshot, version: 1 });

    const row = await rowOf(routeId);
    expect(row?.version).toBe(2);
    expect(Number(row?.ticketPrice)).toBe(90);
  });

  it('marks a deactivated route as inactive without deleting it', async () => {
    const { routeId, snapshot } = route();

    await bus.deliver('RouteCreated', snapshot);
    await bus.deliver('RouteUpdated', { ...snapshot, active: false, version: 2 });

    expect(await rowOf(routeId)).toMatchObject({ active: false, version: 2, deletedAt: null });
  });

  it('leaves a tombstone when RouteDeleted arrives before the route and keeps it from coming back', async () => {
    const { routeId, snapshot, deleted } = route();

    await bus.deliver('RouteDeleted', deleted);
    await bus.deliver('RouteCreated', snapshot);
    await bus.deliver('RouteUpdated', { ...snapshot, version: 2 });

    const row = await rowOf(routeId);
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({ active: false, version: 0, originBranchId: originId });
  });

  it('marks a route deleted after it was recorded and keeps the first deletion time', async () => {
    const { routeId, snapshot, deleted } = route();

    await bus.deliver('RouteCreated', snapshot);
    await bus.deliver('RouteDeleted', deleted);
    const first = (await rowOf(routeId))?.deletedAt;
    await bus.deliver('RouteDeleted', deleted);

    expect(first).toBeInstanceOf(Date);
    expect((await rowOf(routeId))?.deletedAt).toEqual(first);
    expect(await rowOf(routeId)).toMatchObject({ active: false });
  });

  it('stores a tombstone with no branches when the event names none', async () => {
    const routeId = randomUUID();
    routeIds.push(routeId);

    await bus.deliver('RouteDeleted', { routeId });

    expect(await rowOf(routeId)).toMatchObject({ originBranchId: null, destinationBranchId: null });
  });
});
