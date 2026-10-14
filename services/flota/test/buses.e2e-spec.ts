import { randomUUID } from 'node:crypto';
import { busChangedPayloadSchema, busPageSchema } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { identityHeaders } from '@debus/server';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { busRow, driverRow, uniquePlate } from './support/fleet';

const newBus = (over: Record<string, unknown> = {}) => ({
  plate: uniquePlate(),
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 1000,
  operationalStatus: 'AVAILABLE',
  assignedDriverId: null,
  ...over,
});

describe('buses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let branchId: string;
  let otherBranchId: string;
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branchId);
  const http = () => request(app.getHttpServer());

  const newDriver = (fullName: string) =>
    prisma.driver.create({ data: driverRow(branchId, { fullName }) });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    branchId = await seedTestBranch(prisma, 'buses');
    otherBranchId = await seedTestBranch(prisma, 'buses otra');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('registers a bus in the admin branch and queues BusAdded', async () => {
    const body = newBus();
    const response = await http().post('/buses').set(admin()).send(body).expect(201);
    expect(response.body).toMatchObject({
      plate: body.plate,
      branchId,
      displayStatus: 'AVAILABLE',
      hasPhoto: false,
    });
    const added = (await events.committed('BusAdded')).map((payload) =>
      busChangedPayloadSchema.parse(payload),
    );
    expect(added).toContainEqual(expect.objectContaining({ busId: response.body.id, version: 1 }));
  });

  it('refuses a repeated plate with a clear message', async () => {
    const body = newBus();
    await http().post('/buses').set(admin()).send(body).expect(201);
    const response = await http().post('/buses').set(admin()).send(body).expect(409);
    expect(response.body.message).toBe('Ya existe un bus con esa placa.');
  });

  it('refuses a registration when the branch is not active', async () => {
    const inactive = await seedTestBranch(prisma, 'buses inactiva', false);
    const response = await http()
      .post('/buses')
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN', inactive))
      .send(newBus())
      .expect(409);
    expect(response.body.message).toBe('Tu sucursal no está activa.');
  });

  it('lists only the buses of the admin branch, paged, with counts per status', async () => {
    await http().post('/buses').set(admin()).send(newBus()).expect(201);
    await http().post('/buses').set(admin()).send(newBus()).expect(201);
    await prisma.bus.create({ data: busRow(otherBranchId) });
    const response = await http().get('/buses?pageSize=1').set(admin()).expect(200);
    const page = busPageSchema.parse(response.body);
    expect(page.items).toHaveLength(1);
    expect(page.items.every((bus) => bus.branchId === branchId)).toBe(true);
    expect(page.summary.statusCounts.AVAILABLE).toBeGreaterThanOrEqual(2);
    expect(page.total).toBe(
      Object.values(page.summary.statusCounts).reduce((sum, count) => sum + count, 0),
    );
  });

  it('filters by status and finds a bus by an accent-free search', async () => {
    const { body: bus } = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ brand: 'Mercédes', operationalStatus: 'IN_WORKSHOP' }))
      .expect(201);
    const workshop = busPageSchema.parse(
      (await http().get('/buses?status=IN_WORKSHOP').set(admin()).expect(200)).body,
    );
    expect(workshop.items.map((item) => item.id)).toContain(bus.id);
    expect(workshop.items.every((item) => item.displayStatus === 'IN_WORKSHOP')).toBe(true);
    const found = busPageSchema.parse(
      (await http().get('/buses?q=mercedes').set(admin()).expect(200)).body,
    );
    expect(found.items.map((item) => item.id)).toContain(bus.id);
  });

  it('finds a bus by its plate written the way the table shows it', async () => {
    const plate = uniquePlate();
    const { body: bus } = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ plate }))
      .expect(201);
    const shown = `${plate.slice(0, 1)}-${plate.slice(1)}`;

    const found = busPageSchema.parse(
      (await http().get(`/buses?q=${shown}`).set(admin()).expect(200)).body,
    );

    expect(found.items.map((item) => item.id)).toContain(bus.id);
  });

  it('hides the buses of another branch', async () => {
    const other = await prisma.bus.create({ data: busRow(otherBranchId) });
    await http().get(`/buses/${other.id}`).set(admin()).expect(404);
    await http().patch(`/buses/${other.id}`).set(admin()).send(newBus()).expect(404);
  });

  it('edits a bus and queues BusUpdated with the next version', async () => {
    const { body: bus } = await http().post('/buses').set(admin()).send(newBus()).expect(201);
    const { body: updated } = await http()
      .patch(`/buses/${bus.id}`)
      .set(admin())
      .send(newBus({ plate: bus.plate, mileageKm: 5000, operationalStatus: 'IN_WORKSHOP' }))
      .expect(200);
    expect(updated).toMatchObject({ mileageKm: 5000, displayStatus: 'IN_WORKSHOP', version: 2 });
    const changed = (await events.committed('BusUpdated')).map((payload) =>
      busChangedPayloadSchema.parse(payload),
    );
    expect(changed).toContainEqual(
      expect.objectContaining({ busId: bus.id, version: 2, mileageKm: 5000 }),
    );
  });

  it('refuses an edit that lowers the mileage and queues no event for it', async () => {
    const { body: bus } = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ mileageKm: 3000 }))
      .expect(201);
    const before = (await events.committed('BusUpdated')).length;

    const response = await http()
      .patch(`/buses/${bus.id}`)
      .set(admin())
      .send(newBus({ plate: bus.plate, mileageKm: 2999 }))
      .expect(409);

    expect(response.body.message).toContain('kilometraje');
    expect((await events.committed('BusUpdated')).length).toBe(before);
    expect((await http().get(`/buses/${bus.id}`).set(admin()).expect(200)).body.mileageKm).toBe(
      3000,
    );
  });

  it('refuses to deactivate a bus with a scheduled trip and allows it afterwards', async () => {
    const { body: bus } = await http().post('/buses').set(admin()).send(newBus()).expect(201);
    const driver = await newDriver('Ana Sic');
    const trip = await prisma.tripCopy.create({
      data: {
        tripId: randomUUID(),
        busId: bus.id,
        driverId: driver.id,
        departureAt: new Date(Date.now() + 3_600_000),
        estimatedArrivalAt: new Date(Date.now() + 7_200_000),
        status: 'SCHEDULED',
      },
    });

    const refused = await http().post(`/buses/${bus.id}/deactivate`).set(admin()).expect(409);
    expect(refused.body.message).toMatch(/viajes programados/);

    await prisma.tripCopy.update({ where: { tripId: trip.tripId }, data: { status: 'COMPLETED' } });
    await http().post(`/buses/${bus.id}/deactivate`).set(admin()).expect(204);
    const { body: after } = await http().get(`/buses/${bus.id}`).set(admin()).expect(200);
    expect(after).toMatchObject({ active: false, displayStatus: 'INACTIVE', version: 2 });
    await http().post(`/buses/${bus.id}/reactivate`).set(admin()).expect(204);
    const { body: back } = await http().get(`/buses/${bus.id}`).set(admin()).expect(200);
    expect(back).toMatchObject({ active: true, displayStatus: 'AVAILABLE', version: 3 });
  });

  it('lets the driver of a deactivated bus go', async () => {
    const driver = await newDriver('Luis Xol');
    const { body: bus } = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ assignedDriverId: driver.id }))
      .expect(201);
    await http().post(`/buses/${bus.id}/deactivate`).set(admin()).expect(204);
    const { body: after } = await http().get(`/buses/${bus.id}`).set(admin()).expect(200);
    expect(after.assignedDriverId).toBeNull();
    const deactivated = (await events.committed('BusDeactivated')).map((payload) =>
      busChangedPayloadSchema.parse(payload),
    );
    expect(deactivated).toContainEqual(
      expect.objectContaining({ busId: bus.id, active: false, assignedDriverId: null }),
    );
  });

  it('assigns a driver of the branch once and refuses a second bus for the same driver', async () => {
    const driver = await newDriver('Edgar Tzul');
    const { body } = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ assignedDriverId: driver.id }))
      .expect(201);
    expect(body.assignedDriverName).toBe('Edgar Tzul');
    const clash = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ assignedDriverId: driver.id }))
      .expect(409);
    expect(clash.body.message).toBe('Ese chofer ya está asignado a otro bus.');
  });

  it('refuses a driver of another branch', async () => {
    const stranger = await prisma.driver.create({ data: driverRow(otherBranchId) });
    const response = await http()
      .post('/buses')
      .set(admin())
      .send(newBus({ assignedDriverId: stranger.id }))
      .expect(409);
    expect(response.body.message).toBe('Elige un chofer activo de tu sucursal.');
  });

  it('stores a photo checked by its bytes and serves it back', async () => {
    const { body: bus } = await http().post('/buses').set(admin()).send(newBus()).expect(201);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
    await http()
      .put(`/buses/${bus.id}/photo`)
      .set(admin())
      .attach('photo', jpeg, 'bus.png')
      .expect(204);
    const photo = await http().get(`/buses/${bus.id}/photo`).set(admin()).expect(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.headers['cache-control']).toBe('private, max-age=300');
    expect((await http().get(`/buses/${bus.id}`).set(admin())).body.hasPhoto).toBe(true);
    const refused = await http()
      .put(`/buses/${bus.id}/photo`)
      .set(admin())
      .attach('photo', Buffer.from('%PDF-1.7 nope'), 'bus.jpg')
      .expect(400);
    expect(refused.body.message).toBe('Sube una foto JPG, PNG o WebP de hasta 5 MB.');
  });

  it('answers 404 when the bus has no photo and 400 when a photo is too big', async () => {
    const { body: bus } = await http().post('/buses').set(admin()).send(newBus()).expect(201);
    await http().get(`/buses/${bus.id}/photo`).set(admin()).expect(404);
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024 + 1)]);
    const response = await http()
      .put(`/buses/${bus.id}/photo`)
      .set(admin())
      .attach('photo', big, 'big.jpg')
      .expect(400);
    expect(response.body.message).toBe('Sube una foto JPG, PNG o WebP de hasta 5 MB.');
  });

  it('only lets a branch admin in', async () => {
    await http()
      .get('/buses')
      .set(identityHeaders(randomUUID(), 'CASHIER', branchId))
      .expect(403);
    await http().get('/buses').set(identityHeaders(randomUUID(), 'SYSTEM_ADMIN')).expect(403);
    await http().get('/buses').expect(401);
  });

  describe('republishing for the services that keep a copy', () => {
    it('sends every bus of a branch again with a higher version, and touches no other branch', async () => {
      const own = await seedTestBranch(prisma, 'republicar');
      const other = await seedTestBranch(prisma, 'republicar otra');
      const buses = await Promise.all(
        [own, own, other].map((id) => prisma.bus.create({ data: busRow(id) })),
      );

      const response = await http()
        .post('/internal/buses/republish')
        .query({ branchId: own })
        .expect(200);

      expect(response.body).toEqual({ republished: 2 });
      const versions = await prisma.bus.findMany({
        where: { id: { in: buses.map((bus) => bus.id) } },
        select: { id: true, version: true },
      });
      expect(versions.map((row) => row.version).sort()).toEqual([1, 2, 2]);
      const sent = (await events.committed('BusUpdated')).map((payload) =>
        busChangedPayloadSchema.parse(payload),
      );
      expect(sent.filter((payload) => payload.branchId === own).map((p) => p.version)).toEqual([
        2, 2,
      ]);
      expect(sent.some((payload) => payload.branchId === other)).toBe(false);
    });

    it('answers 400 for a branch that is not an id', async () => {
      await http().post('/internal/buses/republish').query({ branchId: 'x' }).expect(400);
    });
  });
});
