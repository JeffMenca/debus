import { randomUUID } from 'node:crypto';
import { REPORT_PDF_MAX_ROWS, systemIncomePageSchema, todayInGuatemala } from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PdfRenderer } from '../src/common/pdf/pdf-renderer';
import type { ReportDocument } from '../src/common/pdf/report-document';
import { REPORT_MESSAGES } from '../src/common/report-messages';
import type { PrismaService } from '../src/prisma/prisma.service';
import { expectOnlySystemAdmin, getAsSystemAdmin, getPdfAsSystemAdmin } from './support/http';
import { type IsolatedReportesApp, startIsolatedReportes } from './support/isolated-app';
import {
  ROUTE_ID,
  type SystemFinanceFixture,
  WINDOW,
  addBranch,
  seedSystemFinance,
} from './support/system-finance-fixture';

describe('system income report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let data: SystemFinanceFixture;
  let hugeBranchId: string;
  let isolated: IsolatedReportesApp;

  const inWindow = `from=${WINDOW.from}&to=${WINDOW.to}`;
  const get = (path: string) => getAsSystemAdmin(app, path);
  const summaryOf = (body: { items: { concept: string; amount: number }[] }) =>
    body.items.map((row) => [row.concept, row.amount]);

  beforeAll(async () => {
    isolated = await startIsolatedReportes('income');
    ({ app, prisma, bus } = isolated);
    data = await seedSystemFinance(bus);
    hugeBranchId = (await addBranch(bus, 'ingresos enorme')).id;
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('lists every sale and paid rental by branch, the latest payment first, without refunded money', async () => {
    const response = await get(`/reports/system-income?${inWindow}`).expect(200);
    const page = systemIncomePageSchema.parse(response.body);

    expect(
      page.items.map((row) => [row.branchName, row.day, row.concept, row.quantity, row.amount]),
    ).toEqual([
      [data.angeles.name, '2031-03-12', 'COUNTER_TICKET', 1, 85],
      [data.angeles.name, '2031-03-11', 'RENTAL', 35, 2760],
      [data.angeles.name, '2031-03-10', 'ONLINE_TICKET', 2, 170],
      [data.boca.name, '2031-03-10', 'COUNTER_TICKET', 10, 850],
    ]);
    expect(page.items[1]).toMatchObject({
      id: data.rentalId,
      clientName: 'Colegio San José',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
    });
    expect(page.items[0]).toMatchObject({ clientName: null, originLabel: 'Quetzaltenango' });
    expect(page).toMatchObject({ total: 4, page: 1, pageSize: 20 });
  });

  it('adds the totals by concept and a subtotal per branch for the whole filtered set', async () => {
    const response = await get(`/reports/system-income?${inWindow}`).expect(200);

    expect(response.body.summary.totals).toEqual({
      entries: 4,
      amount: 3865,
      onlineTickets: 170,
      counterTickets: 935,
      rentals: 2760,
    });
    expect(response.body.summary.groups).toEqual([
      { branchId: data.angeles.id, branchName: data.angeles.name, entries: 3, amount: 3015 },
      { branchId: data.boca.id, branchName: data.boca.name, entries: 1, amount: 850 },
    ]);
  });

  it('keeps only the chosen branch and recalculates the totals', async () => {
    const response = await get(`/reports/system-income?branchId=${data.boca.id}`).expect(200);

    expect(summaryOf(response.body)).toEqual([['COUNTER_TICKET', 850]]);
    expect(response.body.summary.totals).toMatchObject({
      entries: 1,
      amount: 850,
      counterTickets: 850,
    });
    expect(response.body.summary.groups).toHaveLength(1);
  });

  it('shows every record of a branch when the range is empty', async () => {
    const response = await get(`/reports/system-income?branchId=${data.angeles.id}`).expect(200);

    expect(response.body.total).toBe(3);
    expect(response.body.summary.totals.amount).toBe(3015);
  });

  it('filters by the day of payment, both ends included, and either end alone', async () => {
    const day = await get(
      `/reports/system-income?branchId=${data.angeles.id}&from=2031-03-11&to=2031-03-11`,
    ).expect(200);
    expect(summaryOf(day.body)).toEqual([['RENTAL', 2760]]);

    const upTo = await get(
      `/reports/system-income?branchId=${data.angeles.id}&to=2031-03-10`,
    ).expect(200);
    expect(summaryOf(upTo.body)).toEqual([['ONLINE_TICKET', 170]]);

    const from = await get(
      `/reports/system-income?branchId=${data.angeles.id}&from=2031-03-12`,
    ).expect(200);
    expect(summaryOf(from.body)).toEqual([['COUNTER_TICKET', 85]]);

    const none = await get(
      `/reports/system-income?branchId=${data.angeles.id}&from=2031-04-01`,
    ).expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0 });
    expect(none.body.summary).toEqual({
      totals: { entries: 0, amount: 0, onlineTickets: 0, counterTickets: 0, rentals: 0 },
      groups: [],
    });
  });

  it('does not count a rental that was cancelled, before or after it was paid', async () => {
    const response = await get(`/reports/system-income?branchId=${data.angeles.id}`).expect(200);

    expect(
      response.body.items.filter((row: { concept: string }) => row.concept === 'RENTAL'),
    ).toHaveLength(1);
    expect(response.body.summary.totals.rentals).toBe(2760);
  });

  it('does not count the tickets of a deleted trip, sold before or after the deletion', async () => {
    const response = await get(`/reports/system-income?branchId=${data.angeles.id}`).expect(200);

    expect(response.body.summary.totals.onlineTickets).toBe(170);
  });

  it('pages in the server without repeating or skipping a row and keeps the totals of the whole set', async () => {
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const response = await get(
        `/reports/system-income?${inWindow}&pageSize=2&page=${page}`,
      ).expect(200);
      seen.push(...response.body.items.map((row: { id: string }) => row.id));
      expect(response.body).toMatchObject({ total: 4, page, pageSize: 2 });
      expect(response.body.summary.totals.amount).toBe(3865);
      expect(response.body.summary.groups).toHaveLength(2);
    }

    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    const all = await get(`/reports/system-income?${inWindow}`).expect(200);
    expect(seen).toEqual(all.body.items.map((row: { id: string }) => row.id));
  });

  it('shows a branch that was never copied under a neutral name', async () => {
    const orphanBranchId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO branch_report_ticket_sales
        (id, trip_id, route_id, branch_id, bus_id, origin_label, destination_label, departure_at,
         channel, seats, total, paid_on, sold_at)
      VALUES (gen_random_uuid(), gen_random_uuid(), ${ROUTE_ID}::uuid, ${orphanBranchId}::uuid,
              gen_random_uuid(), 'A', 'B', now(), 'ONLINE', 1, 10, '2030-01-01'::date, now())`;

    try {
      const response = await get(`/reports/system-income?branchId=${orphanBranchId}`).expect(200);

      expect(response.body.items[0]).toMatchObject({
        branchName: 'Sucursal sin datos',
        amount: 10,
      });
    } finally {
      await prisma.$executeRaw`DELETE FROM branch_report_ticket_sales WHERE branch_id = ${orphanBranchId}::uuid`;
    }
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/system-income?from=2031-03-10&to=2031-03-01').expect(400);
    await get('/reports/system-income?from=2031-13-01').expect(400);
    await get('/reports/system-income?branchId=not-an-id').expect(400);
    await get('/reports/system-income?pageSize=101').expect(400);
    await get('/reports/system-income/pdf?from=2031-03-10&to=2031-03-01').expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, ['/reports/system-income', '/reports/system-income/pdf']);
  });

  it('exports every filtered entry as a PDF named after the report and the day, grouped by branch', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-income/pdf?${inWindow}`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-ingresos-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(printed.period).toBe('Del 1 mar. 2031 al 31 mar. 2031');
    expect(printed.tables[0]?.rows.map((row) => row.tone ?? 'normal')).toEqual([
      'group',
      'normal',
      'normal',
      'normal',
      'subtotal',
      'group',
      'normal',
      'subtotal',
      'total',
    ]);
    expect(printed.tables[0]?.rows.at(-1)?.cells.at(-1)).toBe('Q 3,865.00');
  });

  it('prints every row in the PDF, not only the first page', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(app, `/reports/system-income/pdf?${inWindow}&pageSize=1`).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.tables[0]?.rows.filter((row) => row.tone === undefined)).toHaveLength(4);
  });

  it('names the branch that was chosen in the PDF and says every record without a range', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(app, `/reports/system-income/pdf?branchId=${data.boca.id}`).expect(
      200,
    );

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual([`Sucursal: ${data.boca.name}`]);
    expect(printed.period).toBe('Todos los registros');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-income/pdf?branchId=${randomUUID()}`,
    ).expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_ticket_sales
        (id, trip_id, route_id, branch_id, bus_id, origin_label, destination_label, departure_at,
         channel, seats, total, paid_on, sold_at)
      SELECT gen_random_uuid(), gen_random_uuid(), ${ROUTE_ID}::uuid, ${hugeBranchId}::uuid,
             gen_random_uuid(), 'A', 'B', now(), 'ONLINE', 1, 1, '2030-01-01'::date, now()
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get(`/reports/system-income/pdf?branchId=${hugeBranchId}`).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/system-income/pdf?branchId=${randomUUID()}`).expect(200);
  });
});
