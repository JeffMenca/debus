import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  branchRentalIncomePageSchema,
  exampleRentalCancelled,
  exampleRentalPaid,
  exampleTripDeleted,
  exampleTripScheduled,
  todayInGuatemala,
} from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import pdfmake from 'pdfmake';
import request from 'supertest';
import { REPORT_MESSAGES } from '../src/common/report-messages';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

describe('branch rental income report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchId: string;
  let otherBranchId: string;
  let hugeBranchId: string;
  let substitutionBranchId: string;
  let cancellationBranchId: string;
  const school = randomUUID();
  const walkIn = randomUUID();
  const church = randomUUID();

  const http = () => request(app.getHttpServer());
  const asAdmin = (branch: string) => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branch);
  const get = (path: string, branch = branchId) => http().get(path).set(asAdmin(branch));
  const names = (body: { items: { clientName: string }[] }) =>
    body.items.map((row) => row.clientName);

  const pay = (branch: string, rentalId: string, over: Partial<typeof exampleRentalPaid>) =>
    bus.deliver('RentalPaid', { ...exampleRentalPaid, rentalId, branchId: branch, ...over });
  const assign = (branch: string, rentalId: string, busPlate: string, departureAt: string) =>
    bus.deliver('TripScheduled', {
      ...exampleTripScheduled,
      tripId: randomUUID(),
      type: 'RENTAL',
      branchId: branch,
      routeId: null,
      busId: randomUUID(),
      busPlate,
      departureAt,
      rentalId,
    });

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'rental income');
    otherBranchId = await seedTestBranch(bus, 'rental income other');
    hugeBranchId = await seedTestBranch(bus, 'rental income huge');
    substitutionBranchId = await seedTestBranch(bus, 'rental income substitution');
    cancellationBranchId = await seedTestBranch(bus, 'rental income cancellation');
    // U+02BC, the apostrophe of the official spelling of the Mayan languages, is not in the PDF font.
    await pay(substitutionBranchId, randomUUID(), { clientName: 'Asociación Kʼicheʼ Xelajú' });

    await pay(branchId, school, {
      clientName: 'Colegio San José',
      nit: '1234567-8',
      departureAt: '2026-10-24T13:00:00.000Z',
      returnAt: '2026-10-24T23:00:00.000Z',
      price: 2760,
      paidOn: '2026-10-21',
    });
    await assign(branchId, school, 'P123ABC', '2026-10-24T13:00:00.000Z');

    await pay(branchId, walkIn, {
      clientName: 'Excursión Los Pérez',
      nit: 'CF',
      destinationLabel: 'Semuc Champey',
      departureAt: '2026-10-30T10:00:00.000Z',
      returnAt: null,
      price: 1500,
      paidOn: '2026-10-18',
    });

    // The first trip of this rental was deleted and the rental went out again on another bus.
    await pay(branchId, church, {
      clientName: 'Iglesia Central',
      nit: '7654321-0',
      departureAt: '2026-10-25T08:00:00.000Z',
      returnAt: '2026-10-25T20:00:00.000Z',
      price: 3200,
      paidOn: '2026-10-21',
    });
    const firstTrip = randomUUID();
    await bus.deliver('TripScheduled', {
      ...exampleTripScheduled,
      tripId: firstTrip,
      type: 'RENTAL',
      branchId,
      routeId: null,
      busPlate: 'P999OLD',
      departureAt: '2026-10-25T08:00:00.000Z',
      rentalId: church,
    });
    await bus.deliver('TripDeleted', {
      ...exampleTripDeleted,
      tripId: firstTrip,
      type: 'RENTAL',
      branchId,
    });
    await assign(branchId, church, 'P555EEE', '2026-10-25T08:00:00.000Z');

    await pay(otherBranchId, randomUUID(), { clientName: 'Empresa Ajena', price: 9000 });
  });
  afterAll(async () => {
    await cleanReportesTestData(prisma, [
      branchId,
      otherBranchId,
      hugeBranchId,
      substitutionBranchId,
      cancellationBranchId,
    ]);
    await app.close();
  });

  it('lists the paid rentals, the latest payment first, with the bus assigned to each', async () => {
    const response = await get('/reports/branch-rental-income').expect(200);
    const page = branchRentalIncomePageSchema.parse(response.body);

    expect(names(response.body)).toEqual([
      'Iglesia Central',
      'Colegio San José',
      'Excursión Los Pérez',
    ]);
    expect(page.items.map((row) => row.busPlate)).toEqual(['P555EEE', 'P123ABC', null]);
    expect(page.items[1]).toEqual({
      rentalId: school,
      clientName: 'Colegio San José',
      nit: '1234567-8',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: '2026-10-24T13:00:00.000Z',
      returnAt: '2026-10-24T23:00:00.000Z',
      paidOn: '2026-10-21',
      passengers: 35,
      busPlate: 'P123ABC',
      price: 2760,
    });
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(page.summary.totals).toEqual({ rentals: 3, income: 7460 });
    expect(page.summary.groups).toEqual([]);
  });

  it('leaves out the cancelled rentals, whichever event arrived first', async () => {
    const [kept, cancelledLate, cancelledEarly] = [randomUUID(), randomUUID(), randomUUID()];
    const cancel = (rentalId: string) =>
      bus.deliver('RentalCancelled', {
        ...exampleRentalCancelled,
        rentalId,
        branchId: cancellationBranchId,
      });
    await pay(cancellationBranchId, kept, { clientName: 'Sigue en pie', price: 1000 });
    await pay(cancellationBranchId, cancelledLate, { clientName: 'Cancelado después' });
    await cancel(cancelledLate);
    await cancel(cancelledEarly);
    await pay(cancellationBranchId, cancelledEarly, { clientName: 'Cancelado antes' });
    await cancel(cancelledLate);

    const response = await get('/reports/branch-rental-income', cancellationBranchId).expect(200);

    expect(names(response.body)).toEqual(['Sigue en pie']);
    expect(response.body.summary.totals).toEqual({ rentals: 1, income: 1000 });
  });

  it('keeps a one-way rental, whose return is empty', async () => {
    const response = await get('/reports/branch-rental-income').expect(200);

    expect(response.body.items[2]).toMatchObject({ rentalId: walkIn, returnAt: null });
  });

  it('never shows the rentals of another branch', async () => {
    const response = await get('/reports/branch-rental-income', otherBranchId).expect(200);

    expect(names(response.body)).toEqual(['Empresa Ajena']);
    expect(response.body.summary.totals).toEqual({ rentals: 1, income: 9000 });
  });

  it('filters by the day the rental was paid, both ends included', async () => {
    const day = await get('/reports/branch-rental-income?from=2026-10-21&to=2026-10-21').expect(
      200,
    );
    expect(names(day.body)).toEqual(['Iglesia Central', 'Colegio San José']);
    expect(day.body.summary.totals).toEqual({ rentals: 2, income: 5960 });

    const upTo = await get('/reports/branch-rental-income?to=2026-10-20').expect(200);
    expect(names(upTo.body)).toEqual(['Excursión Los Pérez']);

    const from = await get('/reports/branch-rental-income?from=2026-10-22').expect(200);
    expect(from.body.items).toEqual([]);
  });

  it('searches the client, the NIT and the destination without accents or capitals', async () => {
    const byName = await get('/reports/branch-rental-income?q=san jose').expect(200);
    expect(names(byName.body)).toEqual(['Colegio San José']);

    const byNit = await get('/reports/branch-rental-income?q=7654321').expect(200);
    expect(names(byNit.body)).toEqual(['Iglesia Central']);

    const byDestination = await get('/reports/branch-rental-income?q=semuc').expect(200);
    expect(names(byDestination.body)).toEqual(['Excursión Los Pérez']);
    expect(byDestination.body.summary.totals).toEqual({ rentals: 1, income: 1500 });
  });

  it('pages in the server and keeps the totals of the whole filtered set', async () => {
    const second = await get('/reports/branch-rental-income?pageSize=1&page=2').expect(200);

    expect(names(second.body)).toEqual(['Colegio San José']);
    expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 1 });
    expect(second.body.summary.totals).toEqual({ rentals: 3, income: 7460 });
  });

  it('answers an empty page when the filters match nothing', async () => {
    const response = await get('/reports/branch-rental-income?q=zzzz').expect(200);

    expect(response.body).toMatchObject({ items: [], total: 0 });
    expect(response.body.summary).toEqual({ totals: { rentals: 0, income: 0 }, groups: [] });
  });

  it('refuses a range that goes backwards or a day that does not exist', async () => {
    await get('/reports/branch-rental-income?from=2026-10-10&to=2026-10-01').expect(400);
    await get('/reports/branch-rental-income?from=2026-13-01').expect(400);
    await get('/reports/branch-rental-income/pdf?from=2026-10-10&to=2026-10-01').expect(400);
  });

  it.each(['CASHIER', 'SYSTEM_ADMIN'])('refuses the role %s', async (role) => {
    const headers = identityHeaders(randomUUID(), role, role === 'CASHIER' ? branchId : undefined);

    await http().get('/reports/branch-rental-income').set(headers).expect(403);
    await http().get('/reports/branch-rental-income/pdf').set(headers).expect(403);
  });

  it('refuses a request without a session', async () => {
    await http().get('/reports/branch-rental-income').expect(401);
  });

  const getPdf = (path: string, branch = branchId) =>
    get(path, branch)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('exports every filtered rental as a PDF named after the report and the day', async () => {
    const response = await getPdf('/reports/branch-rental-income/pdf').expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-ingresos-alquileres-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports the PDF of a filtered report and the message of an empty one', async () => {
    const filtered = await getPdf(
      '/reports/branch-rental-income/pdf?q=colegio&from=2026-10-01&to=2026-10-31',
    ).expect(200);
    expect((filtered.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const empty = await getPdf('/reports/branch-rental-income/pdf?q=zzzz').expect(200);
    expect((empty.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a client whose name the PDF font cannot print, with the closest character', async () => {
    const createPdf = jest.spyOn(pdfmake, 'createPdf');

    const response = await getPdf('/reports/branch-rental-income/pdf', substitutionBranchId).expect(
      200,
    );

    const drawn = JSON.stringify(createPdf.mock.calls.at(-1)?.[0]);
    createPdf.mockRestore();
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(drawn).toContain('Asociación K’iche’ Xelajú');
    expect(drawn).not.toContain('ʼ');
    // The screen keeps the exact name.
    const screen = await get('/reports/branch-rental-income', substitutionBranchId).expect(200);
    expect(names(screen.body)).toEqual(['Asociación Kʼicheʼ Xelajú']);
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_rentals
        (id, branch_id, client_id, nit, client_name, origin_label, destination_label, departure_at,
         return_at, passengers, distance_km, price, paid_on)
      SELECT gen_random_uuid(), ${hugeBranchId}::uuid, NULL, 'CF', 'Cliente', 'A', 'B', now(), NULL,
             10, 50, 1, '2026-10-01'::date
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get('/reports/branch-rental-income/pdf', hugeBranchId).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get('/reports/branch-rental-income/pdf?q=zzzz', hugeBranchId).expect(200);
  });
});
