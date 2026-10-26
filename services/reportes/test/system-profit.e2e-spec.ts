import { randomUUID } from 'node:crypto';
import { REPORT_PDF_MAX_ROWS, systemProfitPageSchema, todayInGuatemala } from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PdfRenderer } from '../src/common/pdf/pdf-renderer';
import type { ReportDocument } from '../src/common/pdf/report-document';
import { REPORT_MESSAGES } from '../src/common/report-messages';
import { expectOnlySystemAdmin, getAsSystemAdmin, getPdfAsSystemAdmin } from './support/http';
import { type IsolatedReportesApp, startIsolatedReportes } from './support/isolated-app';
import {
  type SystemFinanceFixture,
  WINDOW,
  addBranch,
  seedSystemFinance,
  sellTickets,
} from './support/system-finance-fixture';

// The list holds every branch of the database, so the test works on a schema of its own: the
// real ones the local stack keeps would otherwise be rows of the report.
describe('system profit report', () => {
  let isolated: IsolatedReportesApp;
  let app: INestApplication;
  let bus: InMemoryEventBus;
  let data: SystemFinanceFixture;
  let quietId: string;
  let movedInactiveId: string;
  let sleepingInactiveId: string;

  const inWindow = `from=${WINDOW.from}&to=${WINDOW.to}`;
  const get = (path: string) => getAsSystemAdmin(app, path);
  const figures = (row: {
    income: number;
    expenses: number;
    profit: number;
    margin: number | null;
  }) => [row.income, row.expenses, row.profit, row.margin];

  beforeAll(async () => {
    isolated = await startIsolatedReportes('profit');
    ({ app, bus } = isolated);
    data = await seedSystemFinance(bus);
    quietId = (await addBranch(bus, 'Cumbre sin movimiento')).id;
    movedInactiveId = (await addBranch(bus, 'Zona cerrada con ventas', false)).id;
    sleepingInactiveId = (await addBranch(bus, 'Dormida cerrada', false)).id;
    await sellTickets(bus, {
      channel: 'COUNTER',
      branch: { id: movedInactiveId, name: '', busId: randomUUID(), plate: 'P333CCC' },
      tripId: randomUUID(),
      seats: 1,
      unitPrice: 100,
      paidOn: '2031-03-09',
    });
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('lists a row per branch, alphabetically without accents, with its income, expenses, profit and margin', async () => {
    const response = await get(`/reports/system-profit?${inWindow}`).expect(200);
    const page = systemProfitPageSchema.parse(response.body);

    expect(page.items.map((row) => row.branchName)).toEqual([
      data.angeles.name,
      data.boca.name,
      expect.stringContaining('Cumbre sin movimiento'),
      expect.stringContaining('Zona cerrada con ventas'),
    ]);
    expect(page.items[0]).toEqual({
      branchId: data.angeles.id,
      branchName: data.angeles.name,
      ticketIncome: 255,
      rentalIncome: 2760,
      income: 3015,
      fuel: 1180,
      labor: 350.5,
      parts: 5200,
      depreciation: 456,
      expenses: 7186.5,
      profit: -4171.5,
      margin: -138.4,
    });
    expect(figures(page.items[1]!)).toEqual([850, 800, 50, 5.9]);
  });

  it('keeps a branch without movement at zero and a branch that closed but moved in the period', async () => {
    const response = await get(`/reports/system-profit?${inWindow}`).expect(200);
    const byId = new Map(
      systemProfitPageSchema.parse(response.body).items.map((row) => [row.branchId, row]),
    );

    expect(figures(byId.get(quietId)!)).toEqual([0, 0, 0, null]);
    expect(figures(byId.get(movedInactiveId)!)).toEqual([100, 0, 100, 100]);
    expect(byId.has(sleepingInactiveId)).toBe(false);
  });

  it('adds up the totals from the rows of the whole filtered set', async () => {
    const response = await get(`/reports/system-profit?${inWindow}&pageSize=2`).expect(200);

    expect(response.body.total).toBe(4);
    expect(response.body.summary.groups).toEqual([]);
    expect(response.body.summary.totals).toEqual({
      ticketIncome: 1205,
      rentalIncome: 2760,
      income: 3965,
      fuel: 1580,
      labor: 350.5,
      parts: 5500,
      depreciation: 556,
      expenses: 7986.5,
      profit: -4021.5,
      margin: -101.4,
    });
  });

  it('gives the profit of each branch as the income of the first report minus the expenses of the second', async () => {
    const profit = await get(`/reports/system-profit?${inWindow}`).expect(200);
    const income = await get(`/reports/system-income?${inWindow}`).expect(200);
    const expenses = await get(`/reports/system-expenses?${inWindow}`).expect(200);
    const amountOf = (groups: { branchId: string; amount: number }[], id: string) =>
      groups.find((group) => group.branchId === id)?.amount ?? 0;

    for (const row of profit.body.items as {
      branchId: string;
      income: number;
      expenses: number;
      profit: number;
    }[]) {
      const earned = amountOf(income.body.summary.groups, row.branchId);
      const spent = amountOf(expenses.body.summary.groups, row.branchId);
      expect(row.income).toBe(earned);
      expect(row.expenses).toBe(spent);
      expect(row.profit).toBe(Math.round((earned - spent) * 100) / 100);
    }
    expect(profit.body.summary.totals.income).toBe(income.body.summary.totals.amount);
    expect(profit.body.summary.totals.expenses).toBe(expenses.body.summary.totals.amount);
  });

  it('keeps only the chosen branch', async () => {
    const one = await get(`/reports/system-profit?${inWindow}&branchId=${data.boca.id}`).expect(
      200,
    );
    expect(one.body.items.map((row: { branchId: string }) => row.branchId)).toEqual([data.boca.id]);
    expect(one.body.summary.totals).toMatchObject({
      income: 850,
      expenses: 800,
      profit: 50,
      margin: 5.9,
    });

    const closed = await get(
      `/reports/system-profit?${inWindow}&branchId=${sleepingInactiveId}`,
    ).expect(200);
    expect(closed.body).toMatchObject({ items: [], total: 0 });
    expect(closed.body.summary.totals).toMatchObject({ income: 0, profit: 0, margin: null });
  });

  it('shows only the active branches, at zero, for a range with no movement', async () => {
    const response = await get('/reports/system-profit?from=2032-01-01').expect(200);

    expect(response.body.items.map((row: { branchId: string }) => row.branchId)).toEqual([
      data.angeles.id,
      data.boca.id,
      quietId,
    ]);
    expect(response.body.summary.totals).toMatchObject({
      income: 0,
      expenses: 0,
      profit: 0,
      margin: null,
    });
  });

  it('dates each concept by its own day inside a range', async () => {
    const response = await get(
      `/reports/system-profit?branchId=${data.angeles.id}&from=2031-03-12&to=2031-03-14`,
    ).expect(200);

    expect(response.body.items[0]).toMatchObject({
      ticketIncome: 85,
      rentalIncome: 0,
      fuel: 1180,
      depreciation: 306,
      labor: 350.5,
      parts: 5200,
    });
  });

  it('pages in the server without repeating a branch and keeps the totals of the whole set', async () => {
    const seen: string[] = [];
    for (const page of [1, 2]) {
      const response = await get(
        `/reports/system-profit?${inWindow}&pageSize=2&page=${page}`,
      ).expect(200);
      seen.push(...response.body.items.map((row: { branchId: string }) => row.branchId));
      expect(response.body).toMatchObject({ total: 4, page, pageSize: 2 });
      expect(response.body.summary.totals.income).toBe(3965);
    }

    const all = await get(`/reports/system-profit?${inWindow}`).expect(200);
    expect(seen).toEqual(all.body.items.map((row: { branchId: string }) => row.branchId));
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/system-profit?from=2031-03-10&to=2031-03-01').expect(400);
    await get('/reports/system-profit?from=2031-02-30').expect(400);
    await get('/reports/system-profit?branchId=not-an-id').expect(400);
    await get('/reports/system-profit/pdf?from=2031-03-10&to=2031-03-01').expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, ['/reports/system-profit', '/reports/system-profit/pdf']);
  });

  it('exports every filtered branch as a PDF named after the report and the day', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-profit/pdf?${inWindow}&pageSize=1`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-ganancias-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(printed.tables[0]?.rows).toHaveLength(5);
    expect(printed.tables[0]?.rows.at(-1)?.tone).toBe('total');
    expect(printed.highlights.map((item) => item.label)).toEqual([
      'Ingresos',
      'Gastos',
      'Ganancia neta',
      'Margen',
    ]);
  });

  it('names the branch that was chosen in the PDF and exports an empty result as a PDF', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(app, `/reports/system-profit/pdf?branchId=${data.boca.id}`).expect(
      200,
    );
    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual([`Sucursal: ${data.boca.name}`]);

    const empty = await getPdfAsSystemAdmin(
      app,
      `/reports/system-profit/pdf?branchId=${sleepingInactiveId}`,
    ).expect(200);
    expect((empty.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await isolated.prisma.$executeRaw`
      INSERT INTO branches (id, code, name, department, municipality, latitude, longitude, active, version)
      SELECT gen_random_uuid(), 'X', 'Prueba masiva ' || n, 'd', 'm', 0, 0, true, 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1}) n`;

    const response = await get('/reports/system-profit/pdf').expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/system-profit/pdf?branchId=${data.boca.id}`).expect(200);
  });
});
