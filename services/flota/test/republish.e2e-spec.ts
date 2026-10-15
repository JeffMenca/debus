import { driverChangedPayloadSchema, routeChangedPayloadSchema } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { driverRow } from './support/fleet';

describe('republishing for the services that keep a copy', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let branchId: string;
  let otherBranchId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    branchId = await seedTestBranch(prisma, 'republicar choferes');
    otherBranchId = await seedTestBranch(prisma, 'republicar otra');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('sends the drivers of a branch again with a higher version, and touches no other branch', async () => {
    const drivers = await Promise.all(
      [branchId, branchId, otherBranchId].map((id) =>
        prisma.driver.create({ data: driverRow(id) }),
      ),
    );

    const response = await http()
      .post('/internal/drivers/republish')
      .query({ branchId })
      .expect(200);

    expect(response.body).toEqual({ republished: 2 });
    const versions = await prisma.driver.findMany({
      where: { id: { in: drivers.map((driver) => driver.id) } },
      select: { version: true },
    });
    expect(versions.map((row) => row.version).sort()).toEqual([1, 2, 2]);
    const sent = (await events.committed('DriverUpdated')).map((payload) =>
      driverChangedPayloadSchema.parse(payload),
    );
    expect(sent.filter((payload) => payload.branchId === branchId).map((p) => p.version)).toEqual([
      2, 2,
    ]);
    expect(sent.some((payload) => payload.branchId === otherBranchId)).toBe(false);
  });

  it('sends the routes that leave a branch again with a higher version', async () => {
    const destinations = await Promise.all([
      seedTestBranch(prisma, 'republicar destino uno'),
      seedTestBranch(prisma, 'republicar destino dos'),
    ]);
    const route = (originBranchId: string, destinationBranchId: string) =>
      prisma.route.create({
        data: { originBranchId, destinationBranchId, distanceKm: 100, ticketPrice: 60 },
      });
    const own = await Promise.all(destinations.map((id) => route(branchId, id)));
    const foreign = await route(otherBranchId, destinations[0]!);

    const response = await http()
      .post('/internal/routes/republish')
      .query({ branchId })
      .expect(200);

    expect(response.body).toEqual({ republished: 2 });
    const versions = await prisma.route.findMany({
      where: { id: { in: [...own, foreign].map((row) => row.id) } },
      select: { id: true, version: true },
    });
    expect(Object.fromEntries(versions.map((row) => [row.id, row.version]))).toEqual({
      [own[0]!.id]: 2,
      [own[1]!.id]: 2,
      [foreign.id]: 1,
    });
    const sent = (await events.committed('RouteUpdated')).map((payload) =>
      routeChangedPayloadSchema.parse(payload),
    );
    expect(sent.map((payload) => payload.routeId).sort()).toEqual(own.map((row) => row.id).sort());
    expect(sent.every((payload) => payload.version === 2)).toBe(true);
  });

  it.each(['drivers', 'routes'])(
    'answers 400 on %s for a branch that is not an id',
    async (path) => {
      await http().post(`/internal/${path}/republish`).query({ branchId: 'x' }).expect(400);
    },
  );

  it('answers 0 for a branch without drivers or routes', async () => {
    const empty = await seedTestBranch(prisma, 'republicar vacia');
    for (const path of ['drivers', 'routes']) {
      const response = await http()
        .post(`/internal/${path}/republish`)
        .query({ branchId: empty })
        .expect(200);
      expect(response.body).toEqual({ republished: 0 });
    }
  });
});
