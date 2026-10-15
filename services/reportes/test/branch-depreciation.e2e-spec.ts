import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  branchDepreciationPageSchema,
  exampleBus,
  exampleSettingsUpdated,
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

describe('branch depreciation report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchId: string;
  let otherBranchId: string;
  let hugeBranchId: string;
  const rateIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const asAdmin = (branch: string) => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branch);
  const get = (path: string, branch = branchId) => http().get(path).set(asAdmin(branch));
  const plates = (body: { items: { plate: string }[] }) => body.items.map((row) => row.plate);
  const figures = (body: { items: { plate: string; kmTraveled: number; accumulated: number }[] }) =>
    body.items.map((row) => [row.plate, row.kmTraveled, row.accumulated]);

  const addBus = (branch: string, plate: string, brand: string, over = {}) => {
    const busId = randomUUID();
    return bus
      .deliver('BusAdded', { ...exampleBus, busId, branchId: branch, plate, brand, ...over })
      .then(() => busId);
  };
  // Amounts are fixed by the trip itself: the report adds up what the event carries.
  const complete = (
    branch: string,
    busId: string,
    trip: { km: number; perKm: number; arrivedAt: string },
  ) => {
    const tripId = randomUUID();
    return bus
      .deliver('TripCompleted', {
        ...exampleTripCompleted,
        tripId,
        branchId: branch,
        busId,
        startMileageKm: 1000,
        endMileageKm: 1000 + trip.km,
        depreciationPerKm: trip.perKm,
        depreciationAmount: trip.km * trip.perKm,
        departedAt: '2026-10-18T12:00:00.000Z',
        arrivedAt: trip.arrivedAt,
      })
      .then(() => tripId);
  };
  // A rate wins by its effective day and then by its creation instant: the test versions are
  // created far in the future so no rate of a real settings change can outrank them.
  const setRate = (depreciationPerKm: number, effectiveFrom: string, createdAt: string) => {
    const versionId = randomUUID();
    rateIds.push(versionId);
    return bus.deliver('SettingsUpdated', {
      ...exampleSettingsUpdated,
      versionId,
      depreciationPerKm,
      effectiveFrom,
      createdAt,
    });
  };

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'depreciation report');
    otherBranchId = await seedTestBranch(bus, 'depreciation report other');
    hugeBranchId = await seedTestBranch(bus, 'depreciation report huge');

    const volvo = await addBus(branchId, 'P111AAA', 'Volvo');
    const hino = await addBus(branchId, 'P222BBB', 'Hino');
    const retired = await addBus(branchId, 'P333CCC', 'Scania', { active: false, version: 1 });
    const foreign = await addBus(otherBranchId, 'P999ZZZ', 'Volvo');

    // 12:00 in Guatemala on the 19th, and 23:30 in Guatemala on the 20th (already the 21st in UTC).
    await complete(branchId, volvo, {
      km: 200,
      perKm: 1.25,
      arrivedAt: '2026-10-19T18:00:00.000Z',
    });
    await complete(branchId, volvo, { km: 100, perKm: 1.5, arrivedAt: '2026-10-21T05:30:00.000Z' });
    await complete(branchId, retired, {
      km: 50,
      perKm: 1.5,
      arrivedAt: '2026-10-19T18:00:00.000Z',
    });
    await complete(otherBranchId, foreign, {
      km: 400,
      perKm: 2,
      arrivedAt: '2026-10-19T18:00:00.000Z',
    });
    // A trip that left and has not arrived, and one that was completed and later deleted.
    await bus.deliver('TripDeparted', {
      ...exampleTripDeparted,
      tripId: randomUUID(),
      branchId,
      busId: hino,
      driverId: randomUUID(),
    });
    const deletedTrip = await complete(branchId, hino, {
      km: 80,
      perKm: 1.5,
      arrivedAt: '2026-10-19T18:00:00.000Z',
    });
    await bus.deliver('TripDeleted', {
      ...exampleTripDeleted,
      tripId: deletedTrip,
      branchId,
      busId: hino,
    });

    const today = todayInGuatemala();
    const tomorrow = todayInGuatemala(new Date(Date.now() + 86_400_000));
    await setRate(1.25, today, '2099-01-01T00:00:00.000Z');
    await setRate(1.5, today, '2099-01-02T00:00:00.000Z');
    await setRate(9.99, tomorrow, '2099-01-03T00:00:00.000Z');
  });
  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DELETE FROM branch_report_depreciation_rates WHERE id = ANY($1::uuid[])',
      rateIds,
    );
    await cleanReportesTestData(prisma, [branchId, otherBranchId, hugeBranchId]);
    await app.close();
  });

  it('lists every bus of the branch by plate with what its trips depreciated', async () => {
    const response = await get('/reports/branch-depreciation').expect(200);
    const page = branchDepreciationPageSchema.parse(response.body);

    expect(figures(response.body)).toEqual([
      ['P111AAA', 300, 400],
      ['P222BBB', 0, 0],
      ['P333CCC', 50, 75],
    ]);
    expect(page.items.map((row) => [row.completedTrips, row.appliedPerKm])).toEqual([
      [2, 1.33],
      [0, null],
      [1, 1.5],
    ]);
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(page.summary).toEqual({
      totals: { kmTraveled: 350, accumulated: 475, currentPerKm: 1.5 },
      groups: [],
    });
  });

  it('never shows the buses or the trips of another branch', async () => {
    const response = await get('/reports/branch-depreciation', otherBranchId).expect(200);

    expect(figures(response.body)).toEqual([['P999ZZZ', 400, 800]]);
  });

  it('filters the arrivals by the Guatemalan day, not by the UTC day', async () => {
    const late = await get('/reports/branch-depreciation?from=2026-10-20&to=2026-10-20').expect(
      200,
    );
    expect(figures(late.body)).toEqual([
      ['P111AAA', 100, 150],
      ['P222BBB', 0, 0],
      ['P333CCC', 0, 0],
    ]);
    expect(late.body.summary.totals).toMatchObject({ kmTraveled: 100, accumulated: 150 });

    const afterwards = await get('/reports/branch-depreciation?from=2026-10-21').expect(200);
    expect(afterwards.body.summary.totals).toMatchObject({ kmTraveled: 0, accumulated: 0 });

    const first = await get('/reports/branch-depreciation?to=2026-10-19').expect(200);
    expect(figures(first.body)).toEqual([
      ['P111AAA', 200, 250],
      ['P222BBB', 0, 0],
      ['P333CCC', 50, 75],
    ]);
  });

  it('uses the rate in force today and ignores one that starts tomorrow', async () => {
    const response = await get('/reports/branch-depreciation?q=hino').expect(200);

    expect(response.body.summary.totals.currentPerKm).toBe(1.5);
  });

  it('searches without accents over the plate and the bus, and pages in the server', async () => {
    const found = await get('/reports/branch-depreciation?q=hino').expect(200);
    expect(plates(found.body)).toEqual(['P222BBB']);
    expect(found.body).toMatchObject({ total: 1 });
    expect(found.body.summary.totals).toMatchObject({ kmTraveled: 0, accumulated: 0 });

    const byPlate = await get('/reports/branch-depreciation?q=p333').expect(200);
    expect(plates(byPlate.body)).toEqual(['P333CCC']);

    const second = await get('/reports/branch-depreciation?pageSize=2&page=2').expect(200);
    expect(plates(second.body)).toEqual(['P333CCC']);
    expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  });

  it('refuses a range that goes backwards or a day that does not exist', async () => {
    await get('/reports/branch-depreciation?from=2026-10-10&to=2026-10-01').expect(400);
    await get('/reports/branch-depreciation?from=2026-13-01').expect(400);
    await get('/reports/branch-depreciation/pdf?from=2026-10-10&to=2026-10-01').expect(400);
  });

  it.each(['CASHIER', 'SYSTEM_ADMIN'])('refuses the role %s', async (role) => {
    const headers = identityHeaders(randomUUID(), role, role === 'CASHIER' ? branchId : undefined);

    await http().get('/reports/branch-depreciation').set(headers).expect(403);
    await http().get('/reports/branch-depreciation/pdf').set(headers).expect(403);
  });

  it('refuses a request without a session', async () => {
    await http().get('/reports/branch-depreciation').expect(401);
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
    const response = await getPdf(
      '/reports/branch-depreciation/pdf?from=2026-10-01&to=2026-10-31',
    ).expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-depreciacion-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdf('/reports/branch-depreciation/pdf?q=nothing-like-this').expect(
      200,
    );

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_buses
        (id, branch_id, plate, brand, model, capacity, operational_status, active, mileage_km, version)
      SELECT gen_random_uuid(), ${hugeBranchId}::uuid, 'P' || n, 'Volvo', 'B8R', 40, 'AVAILABLE', true, 0, 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1}) AS n`;

    const response = await get('/reports/branch-depreciation/pdf', hugeBranchId).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get('/reports/branch-depreciation/pdf?q=nothing-like-this', hugeBranchId).expect(200);
  });
});
