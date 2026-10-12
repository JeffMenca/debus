import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import {
  busChangedPayloadSchema,
  driverChangedPayloadSchema,
  driverPageSchema,
  todayInGuatemala,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';
import { captureEvents } from './support/events';
import { busRow, driverRow, uniqueLicense, uniquePlate } from './support/fleet';
import { identityHeaders } from './support/identity';

const DAY_MS = 86_400_000;
const inDays = (days: number) =>
  new Date(Date.parse(`${todayInGuatemala()}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const newDriver = (over: Record<string, unknown> = {}) => ({
  fullName: 'Marta Coyoy',
  email: testEmail('driver'),
  phone: '5555-1234',
  licenseNumber: uniqueLicense(),
  licenseType: 'A',
  licenseExpiresOn: inDays(400),
  baseSalary: 350,
  ...over,
});

describe('drivers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: ReturnType<typeof captureEvents>;
  let branchId: string;
  let otherBranchId: string;
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branchId);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    events = captureEvents(app, prisma);
    branchId = await seedTestBranch(prisma, 'choferes');
    otherBranchId = await seedTestBranch(prisma, 'choferes otra');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  it('registers a driver and queues DriverAdded with the email and the licence day', async () => {
    const body = newDriver({ licenseExpiresOn: '2031-05-09' });
    const response = await http().post('/drivers').set(admin()).send(body).expect(201);
    expect(response.body).toMatchObject({
      fullName: 'Marta Coyoy',
      branchId,
      phone: '55551234',
      licenseExpiresOn: '2031-05-09',
      baseSalary: 350,
      active: true,
      assignedBusPlate: null,
      hasPhoto: false,
    });
    const added = (await events.committed('DriverAdded')).map((payload) =>
      driverChangedPayloadSchema.parse(payload),
    );
    expect(added).toContainEqual(
      expect.objectContaining({
        driverId: response.body.id,
        email: body.email,
        licenseExpiresOn: '2031-05-09',
        version: 1,
      }),
    );
  });

  it('refuses a repeated licence and a repeated email with their own messages', async () => {
    const body = newDriver();
    await http().post('/drivers').set(admin()).send(body).expect(201);
    const sameLicense = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ licenseNumber: body.licenseNumber }))
      .expect(409);
    expect(sameLicense.body.message).toBe('Ya existe un chofer con ese número de licencia.');
    const sameEmail = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ email: body.email }))
      .expect(409);
    expect(sameEmail.body.message).toBe('Ya existe un chofer con ese correo.');
  });

  it('refuses a registration when the branch is not active', async () => {
    const inactive = await seedTestBranch(prisma, 'choferes inactiva', false);
    const response = await http()
      .post('/drivers')
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN', inactive))
      .send(newDriver())
      .expect(409);
    expect(response.body.message).toBe('Tu sucursal no está activa.');
  });

  it('lists only the drivers of the branch, paged, with active and inactive counts', async () => {
    const mine = await http().post('/drivers').set(admin()).send(newDriver()).expect(201);
    await http().post('/drivers').set(admin()).send(newDriver()).expect(201);
    await http().post(`/drivers/${mine.body.id}/deactivate`).set(admin()).expect(204);
    await prisma.driver.create({ data: driverRow(otherBranchId) });

    const page = driverPageSchema.parse(
      (await http().get('/drivers?pageSize=1&status=all').set(admin()).expect(200)).body,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items.every((driver) => driver.branchId === branchId)).toBe(true);
    expect(page.summary.statusCounts.active).toBeGreaterThanOrEqual(1);
    expect(page.summary.statusCounts.inactive).toBeGreaterThanOrEqual(1);
    expect(page.total).toBe(page.summary.statusCounts.active + page.summary.statusCounts.inactive);

    const active = driverPageSchema.parse(
      (await http().get('/drivers').set(admin()).expect(200)).body,
    );
    expect(active.items.every((driver) => driver.active)).toBe(true);
    await http().get(`/drivers/${mine.body.id}`).set(admin()).expect(200);
  });

  it('finds a driver by an accent-free search of the name', async () => {
    const { body } = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ fullName: 'Ángel Xicará' }))
      .expect(201);
    const found = driverPageSchema.parse(
      (await http().get('/drivers?q=angel xicara').set(admin()).expect(200)).body,
    );
    expect(found.items.map((driver) => driver.id)).toContain(body.id);
  });

  it('lists first the licences that expire soon, expired ones included', async () => {
    const soon = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ licenseExpiresOn: inDays(5), fullName: 'Pronto Vence' }))
      .expect(201);
    const later = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ licenseExpiresOn: inDays(20), fullName: 'Vence Después' }))
      .expect(201);
    const far = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ licenseExpiresOn: inDays(200), fullName: 'Vence Lejos' }))
      .expect(201);
    const expired = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver({ licenseExpiresOn: inDays(-3), fullName: 'Ya Venció' }))
      .expect(201);

    const page = driverPageSchema.parse(
      (await http().get('/drivers?expiringWithinDays=30').set(admin()).expect(200)).body,
    );
    const ids = page.items.map((driver) => driver.id);
    expect(ids).not.toContain(far.body.id);
    expect(ids.indexOf(expired.body.id)).toBeLessThan(ids.indexOf(soon.body.id));
    expect(ids.indexOf(soon.body.id)).toBeLessThan(ids.indexOf(later.body.id));
  });

  it('hides the drivers of another branch', async () => {
    const other = await prisma.driver.create({ data: driverRow(otherBranchId) });
    await http().get(`/drivers/${other.id}`).set(admin()).expect(404);
    await http().patch(`/drivers/${other.id}`).set(admin()).send(newDriver()).expect(404);
  });

  it('edits a driver and queues DriverUpdated with the next version', async () => {
    const { body: driver } = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver())
      .expect(201);
    const { body: updated } = await http()
      .patch(`/drivers/${driver.id}`)
      .set(admin())
      .send(
        newDriver({
          email: driver.email,
          licenseNumber: driver.licenseNumber,
          licenseExpiresOn: '2032-01-15',
          baseSalary: 420,
        }),
      )
      .expect(200);
    expect(updated).toMatchObject({ licenseExpiresOn: '2032-01-15', baseSalary: 420, version: 2 });
    const changed = (await events.committed('DriverUpdated')).map((payload) =>
      driverChangedPayloadSchema.parse(payload),
    );
    expect(changed).toContainEqual(
      expect.objectContaining({ driverId: driver.id, version: 2, licenseExpiresOn: '2032-01-15' }),
    );
  });

  it('refuses to deactivate a driver with a scheduled trip and allows it afterwards', async () => {
    const { body: driver } = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver())
      .expect(201);
    const bus = await prisma.bus.create({ data: busRow(branchId) });
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

    const refused = await http().post(`/drivers/${driver.id}/deactivate`).set(admin()).expect(409);
    expect(refused.body.message).toMatch(/viajes programados/);

    await prisma.tripCopy.update({ where: { tripId: trip.tripId }, data: { status: 'COMPLETED' } });
    await http().post(`/drivers/${driver.id}/deactivate`).set(admin()).expect(204);
    expect((await http().get(`/drivers/${driver.id}`).set(admin())).body).toMatchObject({
      active: false,
      version: 2,
    });
    const changed = (await events.committed('DriverUpdated')).map((payload) =>
      driverChangedPayloadSchema.parse(payload),
    );
    expect(changed).toContainEqual(
      expect.objectContaining({ driverId: driver.id, active: false, version: 2 }),
    );

    await http().post(`/drivers/${driver.id}/reactivate`).set(admin()).expect(204);
    expect((await http().get(`/drivers/${driver.id}`).set(admin())).body).toMatchObject({
      active: true,
      version: 3,
    });
  });

  it('lets the bus of a deactivated driver go, with its BusUpdated', async () => {
    const { body: driver } = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver())
      .expect(201);
    const { body: bus } = await http()
      .post('/buses')
      .set(admin())
      .send({
        plate: uniquePlate(),
        brand: 'Volvo',
        model: 'B8R',
        year: 2021,
        capacity: 40,
        mileageKm: 1000,
        operationalStatus: 'AVAILABLE',
        assignedDriverId: driver.id,
      })
      .expect(201);
    expect((await http().get(`/drivers/${driver.id}`).set(admin())).body.assignedBusPlate).toBe(
      bus.plate,
    );

    await http().post(`/drivers/${driver.id}/deactivate`).set(admin()).expect(204);

    const after = (await http().get(`/buses/${bus.id}`).set(admin())).body;
    expect(after).toMatchObject({ assignedDriverId: null, version: 2 });
    const updated = (await events.committed('BusUpdated')).map((payload) =>
      busChangedPayloadSchema.parse(payload),
    );
    expect(updated).toContainEqual(
      expect.objectContaining({ busId: bus.id, assignedDriverId: null, version: 2 }),
    );
  });

  it('stores a photo checked by its bytes and serves it back', async () => {
    const { body: driver } = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver())
      .expect(201);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    await http()
      .put(`/drivers/${driver.id}/photo`)
      .set(admin())
      .attach('photo', png, 'chofer.jpg')
      .expect(204);
    const photo = await http().get(`/drivers/${driver.id}/photo`).set(admin()).expect(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect((await http().get(`/drivers/${driver.id}`).set(admin())).body.hasPhoto).toBe(true);
    await http()
      .put(`/drivers/${driver.id}/photo`)
      .set(admin())
      .attach('photo', Buffer.from('%PDF-1.7 nope'), 'chofer.jpg')
      .expect(400);
  });

  it('answers 404 when the driver has no photo', async () => {
    const { body: driver } = await http()
      .post('/drivers')
      .set(admin())
      .send(newDriver())
      .expect(201);
    await http().get(`/drivers/${driver.id}/photo`).set(admin()).expect(404);
  });

  it('only lets a branch admin in', async () => {
    await http()
      .get('/drivers')
      .set(identityHeaders(randomUUID(), 'CASHIER', branchId))
      .expect(403);
    await http().get('/drivers').expect(401);
  });
});
