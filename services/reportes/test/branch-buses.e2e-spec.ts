import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  branchBusesPageSchema,
  exampleBus,
  exampleDriver,
  exampleTripCompleted,
  exampleTripDeleted,
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

describe('branch buses report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchId: string;
  let otherBranchId: string;
  let precedenceBranchId: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = (branch: string) => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branch);
  const get = (path: string, branch = branchId) => http().get(path).set(asAdmin(branch));

  const addBus = (branch: string, plate: string, over: Record<string, unknown> = {}) => {
    const busId = randomUUID();
    return bus
      .deliver('BusAdded', {
        ...exampleBus,
        busId,
        branchId: branch,
        plate,
        assignedDriverId: null,
        version: 1,
        ...over,
      })
      .then(() => busId);
  };
  const depart = (branch: string, busId: string) => {
    const tripId = randomUUID();
    const ids = { tripId, branchId: branch, busId, driverId: randomUUID() };
    return bus.deliver('TripDeparted', { ...exampleTripDeparted, ...ids }).then(() => ids);
  };

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'buses report');
    otherBranchId = await seedTestBranch(bus, 'buses report other');
    precedenceBranchId = await seedTestBranch(bus, 'buses report precedence');

    const driverId = randomUUID();
    await bus.deliver('DriverAdded', {
      ...exampleDriver,
      driverId,
      branchId,
      fullName: 'Ana Pérez',
    });
    await addBus(branchId, 'ZZ100AAA', { assignedDriverId: driverId });
    await addBus(branchId, 'ZZ200BBB', {
      brand: 'Hino',
      model: 'RK8',
      operationalStatus: 'IN_WORKSHOP',
    });
    await addBus(branchId, 'ZZ300CCC', { brand: 'Hino', model: 'RK8', active: false });
    await depart(branchId, await addBus(branchId, 'ZZ400DDD'));
    const completedBus = await addBus(branchId, 'ZZ500EEE', { mileageKm: 1000 });
    await bus.deliver('TripCompleted', {
      ...exampleTripCompleted,
      tripId: randomUUID(),
      branchId,
      busId: completedBus,
      startMileageKm: 1000,
      endMileageKm: 1204,
    });
    await addBus(otherBranchId, 'ZZ900ZZZ');

    await depart(
      precedenceBranchId,
      await addBus(precedenceBranchId, 'ZZ610AAA', { active: false }),
    );
    await depart(
      precedenceBranchId,
      await addBus(precedenceBranchId, 'ZZ620BBB', { operationalStatus: 'IN_WORKSHOP' }),
    );
    const deleted = await depart(precedenceBranchId, await addBus(precedenceBranchId, 'ZZ630CCC'));
    await bus.deliver('TripDeleted', { ...exampleTripDeleted, ...deleted });
  });
  afterAll(async () => {
    await cleanReportesTestData(prisma);
    await app.close();
  });

  it('lists the buses of the branch by plate with the status, driver and current mileage', async () => {
    const response = await get('/reports/branch-buses').expect(200);
    const page = branchBusesPageSchema.parse(response.body);

    expect(page.items.map((row) => [row.plate, row.status])).toEqual([
      ['ZZ100AAA', 'AVAILABLE'],
      ['ZZ200BBB', 'IN_WORKSHOP'],
      ['ZZ300CCC', 'INACTIVE'],
      ['ZZ400DDD', 'IN_TRANSIT'],
      ['ZZ500EEE', 'AVAILABLE'],
    ]);
    expect(page.items.map((row) => row.driverName)).toEqual(['Ana Pérez', null, null, null, null]);
    expect(page.items[4]).toMatchObject({ mileageKm: 1204, completedTrips: 1 });
    expect(page.items[0]).toMatchObject({ brand: 'Volvo', model: 'B8R', capacity: 40 });
    expect(page).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(page.summary.totals).toEqual({ buses: 5, completedTrips: 1 });
    expect(page.summary.groups).toEqual([
      { status: 'IN_TRANSIT', buses: 1 },
      { status: 'AVAILABLE', buses: 2 },
      { status: 'IN_WORKSHOP', buses: 1 },
      { status: 'INACTIVE', buses: 1 },
    ]);
  });

  it('never shows the buses of another branch', async () => {
    const response = await get('/reports/branch-buses', otherBranchId).expect(200);

    expect(response.body.items.map((row: { plate: string }) => row.plate)).toEqual(['ZZ900ZZZ']);
  });

  it('puts an inactive bus first, then one on the road, and ignores a deleted trip', async () => {
    const response = await get('/reports/branch-buses', precedenceBranchId).expect(200);

    expect(
      response.body.items.map((row: { plate: string; status: string }) => [row.plate, row.status]),
    ).toEqual([
      ['ZZ610AAA', 'INACTIVE'],
      ['ZZ620BBB', 'IN_TRANSIT'],
      ['ZZ630CCC', 'AVAILABLE'],
    ]);
  });

  it('filters by status but keeps counting every status in the groups', async () => {
    const response = await get('/reports/branch-buses?status=IN_WORKSHOP').expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.total).toBe(1);
    expect(response.body.summary.totals).toEqual({ buses: 1, completedTrips: 0 });
    expect(response.body.summary.groups.map((g: { buses: number }) => g.buses)).toEqual([
      1, 2, 1, 1,
    ]);
  });

  it('searches without accents and pages in the server', async () => {
    const volvo = await get('/reports/branch-buses?q=volvó').expect(200);
    expect(volvo.body.items.map((row: { plate: string }) => row.plate)).toEqual([
      'ZZ100AAA',
      'ZZ400DDD',
      'ZZ500EEE',
    ]);

    const second = await get('/reports/branch-buses?pageSize=2&page=2').expect(200);
    expect(second.body.items.map((row: { plate: string }) => row.plate)).toEqual([
      'ZZ300CCC',
      'ZZ400DDD',
    ]);
    expect(second.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
  });

  it('refuses a status that does not exist', async () => {
    await get('/reports/branch-buses?status=BROKEN').expect(400);
    await get('/reports/branch-buses/pdf?status=BROKEN').expect(400);
  });

  it.each(['CASHIER', 'SYSTEM_ADMIN'])('refuses the role %s', async (role) => {
    const headers = identityHeaders(randomUUID(), role, role === 'CASHIER' ? branchId : undefined);

    await http().get('/reports/branch-buses').set(headers).expect(403);
    await http().get('/reports/branch-buses/pdf').set(headers).expect(403);
  });

  it('refuses a request without a session', async () => {
    await http().get('/reports/branch-buses').expect(401);
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
    const response = await getPdf('/reports/branch-buses/pdf?status=all').expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-buses-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a PDF with the status and the search of the screen', async () => {
    const response = await getPdf('/reports/branch-buses/pdf?status=IN_WORKSHOP&q=hino').expect(
      200,
    );

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdf('/reports/branch-buses/pdf?q=nothing-like-this').expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    const hugeBranchId = await seedTestBranch(bus, 'buses report huge');
    await prisma.$executeRaw`
      INSERT INTO branch_report_buses
        (id, branch_id, plate, brand, model, capacity, operational_status, active, mileage_km, version)
      SELECT gen_random_uuid(), ${hugeBranchId}::uuid, 'ZZ' || n, 'Volvo', 'B8R', 40, 'AVAILABLE', true, 0, 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1}) AS n`;

    const response = await get('/reports/branch-buses/pdf', hugeBranchId).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get('/reports/branch-buses/pdf?q=nothing-like-this', hugeBranchId).expect(200);
  });
});
