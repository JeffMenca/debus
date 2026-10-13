import { randomUUID } from 'node:crypto';
import {
  routeChangedPayloadSchema,
  routeDeletedPayloadSchema,
  routePageSchema,
} from '@debus/contracts';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanFleetTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { identityHeaders } from './support/identity';

describe('routes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let branchId: string;
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branchId);
  const http = () => request(app.getHttpServer());

  // A destination branch whose name has an accent, so the search can be proven accent-free.
  const seedBranch = async (name: string, active = true) => {
    const id = randomUUID();
    await prisma.branchCopy.create({
      data: {
        id,
        code: 'TST',
        name: `${TEST_BRANCH_PREFIX}${TEST_RUN} ${name}`,
        active,
        version: 1,
      },
    });
    return id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    branchId = await seedBranch('rutas origen');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('creates a route with the names of both branches and queues RouteCreated', async () => {
    const destinationBranchId = await seedBranch('Quetzaltenango destino');
    const response = await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 201.5, ticketPrice: 85 })
      .expect(201);
    expect(response.body).toMatchObject({
      originBranchId: branchId,
      originName: expect.stringContaining('rutas origen'),
      destinationBranchId,
      destinationName: expect.stringContaining('Quetzaltenango destino'),
      distanceKm: 201.5,
      ticketPrice: 85,
      active: true,
      hasTrips: false,
      version: 1,
    });
    const created = (await events.committed('RouteCreated')).map((payload) =>
      routeChangedPayloadSchema.parse(payload),
    );
    expect(created).toContainEqual(
      expect.objectContaining({ routeId: response.body.id, originBranchId: branchId, version: 1 }),
    );
  });

  it('refuses the own branch and an inactive branch as destination', async () => {
    const inactive = await seedBranch('inactiva', false);
    for (const destinationBranchId of [branchId, inactive, randomUUID()]) {
      const response = await http()
        .post('/routes')
        .set(admin())
        .send({ destinationBranchId, distanceKm: 10, ticketPrice: 5 })
        .expect(409);
      expect(response.body.message).toBe('Elige otra sucursal activa como destino.');
    }
  });

  it('refuses a second route to the same branch and a branch of its own that is not active', async () => {
    const destinationBranchId = await seedBranch('repetida');
    const body = { destinationBranchId, distanceKm: 10, ticketPrice: 5 };
    await http().post('/routes').set(admin()).send(body).expect(201);
    const clash = await http().post('/routes').set(admin()).send(body).expect(409);
    expect(clash.body.message).toBe(
      'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
    );

    const inactiveOrigin = await seedBranch('origen inactivo', false);
    const refused = await http()
      .post('/routes')
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN', inactiveOrigin))
      .send(body)
      .expect(409);
    expect(refused.body.message).toBe('Tu sucursal no está activa.');
  });

  it('rejects distances with more than one decimal and non positive prices', async () => {
    const destinationBranchId = await seedBranch('invalida');
    await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 10.55, ticketPrice: 5 })
      .expect(400);
    await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 10, ticketPrice: 0 })
      .expect(400);
  });

  it('edits the price and queues RouteUpdated with the next version', async () => {
    const destinationBranchId = await seedBranch('editable');
    const { body: route } = await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 100, ticketPrice: 50 })
      .expect(201);
    const { body: updated } = await http()
      .patch(`/routes/${route.id}`)
      .set(admin())
      .send({ distanceKm: 110.5, ticketPrice: 60, active: true })
      .expect(200);
    expect(updated).toMatchObject({ distanceKm: 110.5, ticketPrice: 60, version: 2 });
    const changed = (await events.committed('RouteUpdated')).map((payload) =>
      routeChangedPayloadSchema.parse(payload),
    );
    expect(changed).toContainEqual(
      expect.objectContaining({ routeId: route.id, ticketPrice: 60, version: 2 }),
    );
  });

  it('retires a route and it leaves the active tab', async () => {
    const destinationBranchId = await seedBranch('retirable');
    const { body: route } = await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 100, ticketPrice: 50 })
      .expect(201);
    await http()
      .patch(`/routes/${route.id}`)
      .set(admin())
      .send({ distanceKm: 100, ticketPrice: 50, active: false })
      .expect(200);

    const active = routePageSchema.parse(
      (await http().get('/routes').set(admin()).expect(200)).body,
    );
    const retired = routePageSchema.parse(
      (await http().get('/routes?status=inactive').set(admin()).expect(200)).body,
    );
    expect(active.items.map((item) => item.id)).not.toContain(route.id);
    expect(retired.items.map((item) => item.id)).toContain(route.id);
    expect(retired.summary.statusCounts.inactive).toBeGreaterThanOrEqual(1);
  });

  it('deletes a route that never had trips and queues RouteDeleted', async () => {
    const destinationBranchId = await seedBranch('borrable');
    const { body: route } = await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 100, ticketPrice: 50 })
      .expect(201);
    await http().delete(`/routes/${route.id}`).set(admin()).expect(204);
    expect(await prisma.route.findUnique({ where: { id: route.id } })).toBeNull();
    const deleted = (await events.committed('RouteDeleted')).map((payload) =>
      routeDeletedPayloadSchema.parse(payload),
    );
    expect(deleted).toContainEqual({ routeId: route.id });
  });

  it('keeps a route that already had trips', async () => {
    const destinationBranchId = await seedBranch('con viajes');
    const { body: route } = await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 100, ticketPrice: 50 })
      .expect(201);
    await prisma.route.update({ where: { id: route.id }, data: { hasTrips: true } });

    const response = await http().delete(`/routes/${route.id}`).set(admin()).expect(409);
    expect(response.body.message).toBe(
      'Esta ruta ya tiene viajes. Puedes retirarla para que no se programen más.',
    );
    await http()
      .patch(`/routes/${route.id}`)
      .set(admin())
      .send({ distanceKm: 100, ticketPrice: 70, active: false })
      .expect(200);
  });

  it('hides the routes of another branch', async () => {
    const otherOrigin = await seedBranch('otro origen');
    const destinationBranchId = await seedBranch('destino ajeno');
    const foreign = await prisma.route.create({
      data: {
        originBranchId: otherOrigin,
        destinationBranchId,
        distanceKm: 10,
        ticketPrice: 5,
      },
    });
    await http()
      .patch(`/routes/${foreign.id}`)
      .set(admin())
      .send({ distanceKm: 10, ticketPrice: 5, active: true })
      .expect(404);
    await http().delete(`/routes/${foreign.id}`).set(admin()).expect(404);
    const page = routePageSchema.parse((await http().get('/routes?status=all').set(admin())).body);
    expect(page.items.map((item) => item.id)).not.toContain(foreign.id);
  });

  it('finds a route by the accent-free name of its destination', async () => {
    const destinationBranchId = await seedBranch('Petén búsqueda');
    const { body: route } = await http()
      .post('/routes')
      .set(admin())
      .send({ destinationBranchId, distanceKm: 100, ticketPrice: 50 })
      .expect(201);
    const found = routePageSchema.parse(
      (await http().get('/routes?q=peten busqueda').set(admin()).expect(200)).body,
    );
    expect(found.items.map((item) => item.id)).toContain(route.id);
  });

  it('only lets a branch admin in', async () => {
    await http()
      .get('/routes')
      .set(identityHeaders(randomUUID(), 'CASHIER', branchId))
      .expect(403);
    await http().get('/routes').expect(401);
  });
});
