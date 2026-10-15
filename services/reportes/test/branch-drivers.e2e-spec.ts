import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  branchDriversPageSchema,
  exampleDriver,
  exampleTripCompleted,
  exampleTripDeparted,
  todayInGuatemala,
} from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { REPORT_MESSAGES } from '../src/common/report-messages';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

describe('branch drivers report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchId: string;
  let otherBranchId: string;
  let hugeBranchId: string;
  let anaId: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = (branch: string) => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branch);
  const get = (path: string, branch = branchId) => http().get(path).set(asAdmin(branch));
  const names = (body: { items: { fullName: string }[] }) => body.items.map((row) => row.fullName);

  const addDriver = (branch: string, fullName: string, over: Record<string, unknown> = {}) => {
    const driverId = randomUUID();
    return bus
      .deliver('DriverAdded', {
        ...exampleDriver,
        driverId,
        branchId: branch,
        fullName,
        licenseNumber: `L${driverId.slice(0, 7)}`,
        version: 1,
        ...over,
      })
      .then(() => driverId);
  };
  const complete = (branch: string, driverId: string) =>
    bus.deliver('TripCompleted', {
      ...exampleTripCompleted,
      tripId: randomUUID(),
      branchId: branch,
      driverId,
      busId: randomUUID(),
    });

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'drivers report');
    otherBranchId = await seedTestBranch(bus, 'drivers report other');
    hugeBranchId = await seedTestBranch(bus, 'drivers report huge');

    anaId = await addDriver(branchId, 'Ana Pérez', { licenseType: 'B' });
    const luisId = await addDriver(branchId, 'Luis Gómez');
    await addDriver(branchId, 'José Núñez', { active: false, licenseExpiresOn: '2026-11-05' });
    await addDriver(otherBranchId, 'Beatriz Otero');

    await complete(branchId, anaId);
    await complete(branchId, anaId);
    await complete(branchId, luisId);
    await bus.deliver('TripDeparted', {
      ...exampleTripDeparted,
      tripId: randomUUID(),
      branchId,
      driverId: anaId,
      busId: randomUUID(),
    });
  });
  afterAll(async () => {
    await cleanReportesTestData(prisma, [branchId, otherBranchId, hugeBranchId]);
    await app.close();
  });

  it('lists the drivers of the branch by name with the trips they completed', async () => {
    const response = await get('/reports/branch-drivers').expect(200);
    const page = branchDriversPageSchema.parse(response.body);

    expect(page.items.map((row) => [row.fullName, row.completedTrips, row.active])).toEqual([
      ['Ana Pérez', 2, true],
      ['José Núñez', 0, false],
      ['Luis Gómez', 1, true],
    ]);
    expect(page.items[0]).toMatchObject({ licenseType: 'B', licenseExpiresOn: '2027-03-01' });
    expect(page.items[1]?.licenseExpiresOn).toBe('2026-11-05');
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(page.summary.totals).toEqual({ drivers: 3, completedTrips: 3 });
    expect(page.summary.groups).toEqual([
      { active: true, drivers: 2 },
      { active: false, drivers: 1 },
    ]);
  });

  it('never shows the drivers of another branch', async () => {
    const response = await get('/reports/branch-drivers', otherBranchId).expect(200);

    expect(names(response.body)).toEqual(['Beatriz Otero']);
    expect(response.body.items[0].completedTrips).toBe(0);
  });

  it('filters by status but keeps counting both in the groups', async () => {
    const inactive = await get('/reports/branch-drivers?status=inactive').expect(200);
    expect(names(inactive.body)).toEqual(['José Núñez']);
    expect(inactive.body.summary.totals).toEqual({ drivers: 1, completedTrips: 0 });
    expect(inactive.body.summary.groups).toEqual([
      { active: true, drivers: 2 },
      { active: false, drivers: 1 },
    ]);

    const active = await get('/reports/branch-drivers?status=active').expect(200);
    expect(names(active.body)).toEqual(['Ana Pérez', 'Luis Gómez']);
    expect(active.body.summary.totals).toEqual({ drivers: 2, completedTrips: 3 });
  });

  it('searches without accents and pages in the server', async () => {
    const found = await get('/reports/branch-drivers?q=nunez').expect(200);
    expect(names(found.body)).toEqual(['José Núñez']);

    const byLicense = await get(
      `/reports/branch-drivers?q=${encodeURIComponent('l' + anaId.slice(0, 7))}`,
    );
    expect(names(byLicense.body)).toEqual(['Ana Pérez']);

    const second = await get('/reports/branch-drivers?pageSize=2&page=2').expect(200);
    expect(names(second.body)).toEqual(['Luis Gómez']);
    expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  });

  it('refuses a status that does not exist', async () => {
    await get('/reports/branch-drivers?status=IN_TRANSIT').expect(400);
    await get('/reports/branch-drivers/pdf?status=IN_TRANSIT').expect(400);
  });

  it.each(['CASHIER', 'SYSTEM_ADMIN'])('refuses the role %s', async (role) => {
    const headers = identityHeaders(randomUUID(), role, role === 'CASHIER' ? branchId : undefined);

    await http().get('/reports/branch-drivers').set(headers).expect(403);
    await http().get('/reports/branch-drivers/pdf').set(headers).expect(403);
  });

  it('refuses a request without a session', async () => {
    await http().get('/reports/branch-drivers').expect(401);
  });

  const getPdf = (path: string, branch = branchId) =>
    get(path, branch)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('exports every filtered row as a PDF named after the report and the day', async () => {
    const response = await getPdf('/reports/branch-drivers/pdf?status=active').expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-choferes-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdf('/reports/branch-drivers/pdf?q=nothing-like-this').expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_drivers
        (id, branch_id, full_name, license_number, license_type, license_expires_on, active, version)
      SELECT gen_random_uuid(), ${hugeBranchId}::uuid, 'Chofer ' || n, 'L' || n, 'A', DATE '2027-01-01', true, 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1}) AS n`;

    const response = await get('/reports/branch-drivers/pdf', hugeBranchId).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get('/reports/branch-drivers/pdf?q=nothing-like-this', hugeBranchId).expect(200);
  });
});
