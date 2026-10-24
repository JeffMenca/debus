import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  exampleBus,
  exampleTripCompleted,
  exampleTripDeleted,
  systemExpensesPageSchema,
  todayInGuatemala,
} from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PdfRenderer } from '../src/common/pdf/pdf-renderer';
import type { ReportDocument } from '../src/common/pdf/report-document';
import { REPORT_MESSAGES } from '../src/common/report-messages';
import type { PrismaService } from '../src/prisma/prisma.service';
import { expectOnlySystemAdmin, getAsSystemAdmin, getPdfAsSystemAdmin } from './support/http';
import { type IsolatedReportesApp, startIsolatedReportes } from './support/isolated-app';
import {
  type SystemFinanceFixture,
  WINDOW,
  addBranch,
  seedSystemFinance,
} from './support/system-finance-fixture';

describe('system expenses report', () => {
  let app: INestApplication;
  let isolated: IsolatedReportesApp;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let data: SystemFinanceFixture;
  let hugeBranchId: string;
  let deletedTripBranchId: string;

  const inWindow = `from=${WINDOW.from}&to=${WINDOW.to}`;
  const get = (path: string) => getAsSystemAdmin(app, path);
  const concepts = (body: { items: { concept: string }[] }) => body.items.map((row) => row.concept);

  beforeAll(async () => {
    isolated = await startIsolatedReportes('expenses');
    ({ app, prisma, bus } = isolated);
    data = await seedSystemFinance(bus);
    hugeBranchId = (await addBranch(bus, 'gastos enorme')).id;
    deletedTripBranchId = (await addBranch(bus, 'gastos viaje eliminado')).id;
    const busId = randomUUID();
    const tripId = randomUUID();
    await bus.deliver('BusAdded', { ...exampleBus, busId, branchId: deletedTripBranchId });
    const ids = { tripId, branchId: deletedTripBranchId, busId };
    await bus.deliver('TripCompleted', {
      ...exampleTripCompleted,
      ...ids,
      arrivedAt: '2031-03-16T15:00:00.000Z',
    });
    await bus.deliver('TripDeleted', { ...exampleTripDeleted, ...ids });
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('lists the fuel, the depreciation and the repair lines by branch, the latest day first', async () => {
    const response = await get(
      `/reports/system-expenses?${inWindow}&branchId=${data.angeles.id}`,
    ).expect(200);
    const page = systemExpensesPageSchema.parse(response.body);

    expect(page.items.map((row) => [row.day, row.concept, row.amount, row.busPlate])).toEqual([
      ['2031-03-20', 'DEPRECIATION', 150, 'P111AAA'],
      ['2031-03-14', 'PART', 5200, 'P111AAA'],
      ['2031-03-14', 'LABOR', 350.5, 'P111AAA'],
      ['2031-03-12', 'DEPRECIATION', 306, 'P111AAA'],
      ['2031-03-12', 'FUEL', 1180, 'P111AAA'],
    ]);
    expect(page.items[4]).toMatchObject({
      id: `${data.borderTripId}:FUEL`,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      categoryName: null,
      description: null,
    });
    expect(page.items[1]).toMatchObject({
      id: `${data.repairExpenseId}:0`,
      categoryName: 'Llantas',
      description: 'Dos llantas delanteras',
      originLabel: null,
    });
  });

  it('orders the branches alphabetically and adds the totals by concept and a subtotal per branch', async () => {
    const response = await get(`/reports/system-expenses?${inWindow}`).expect(200);

    expect(response.body.items.map((row: { branchName: string }) => row.branchName)).toEqual([
      ...Array(5).fill(data.angeles.name),
      ...Array(3).fill(data.boca.name),
    ]);
    expect(response.body.summary.totals).toEqual({
      entries: 8,
      amount: 7986.5,
      fuel: 1580,
      depreciation: 556,
      labor: 350.5,
      parts: 5500,
    });
    expect(response.body.summary.groups).toEqual([
      { branchId: data.angeles.id, branchName: data.angeles.name, entries: 5, amount: 7186.5 },
      { branchId: data.boca.id, branchName: data.boca.name, entries: 3, amount: 800 },
    ]);
    expect(response.body.total).toBe(8);
  });

  it('leaves out an amount of zero, a trip that was deleted and the pay of the driver', async () => {
    const angeles = await get(`/reports/system-expenses?branchId=${data.angeles.id}`).expect(200);
    expect(concepts(angeles.body).filter((concept) => concept === 'FUEL')).toHaveLength(1);
    expect(angeles.body.summary.totals.entries).toBe(5);

    const deleted = await get(`/reports/system-expenses?branchId=${deletedTripBranchId}`).expect(
      200,
    );
    expect(deleted.body).toMatchObject({ items: [], total: 0 });
    expect(JSON.stringify(angeles.body)).not.toMatch(/driverPay|SALARY/i);
  });

  it('keeps only the chosen branch and recalculates the totals', async () => {
    const response = await get(`/reports/system-expenses?branchId=${data.boca.id}`).expect(200);

    expect(response.body.summary.totals).toEqual({
      entries: 3,
      amount: 800,
      fuel: 400,
      depreciation: 100,
      labor: 0,
      parts: 300,
    });
    expect(response.body.summary.groups).toHaveLength(1);
  });

  it('dates a trip by the Guatemalan day of its arrival, in the border of the day', async () => {
    const through12 = await get(
      `/reports/system-expenses?branchId=${data.angeles.id}&to=2031-03-12`,
    ).expect(200);
    expect(concepts(through12.body).sort()).toEqual(['DEPRECIATION', 'FUEL']);
    expect(through12.body.summary.totals.amount).toBe(1486);

    const from13 = await get(
      `/reports/system-expenses?branchId=${data.angeles.id}&from=2031-03-13`,
    ).expect(200);
    expect(from13.body.items.map((row: { id: string }) => row.id)).not.toContain(
      `${data.borderTripId}:FUEL`,
    );
    expect(from13.body.summary.totals.amount).toBe(5700.5);
  });

  it('dates a repair by the day of the service, both ends included', async () => {
    const response = await get(
      `/reports/system-expenses?branchId=${data.angeles.id}&from=2031-03-14&to=2031-03-14`,
    ).expect(200);

    expect(concepts(response.body)).toEqual(['PART', 'LABOR']);
    expect(response.body.summary.totals).toMatchObject({ labor: 350.5, parts: 5200 });
  });

  it('shows every record of a branch when the range is empty and nothing past a far range', async () => {
    const all = await get(`/reports/system-expenses?branchId=${data.boca.id}`).expect(200);
    expect(all.body.total).toBe(3);

    const none = await get(
      `/reports/system-expenses?branchId=${data.boca.id}&from=2032-01-01`,
    ).expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0 });
    expect(none.body.summary).toEqual({
      totals: { entries: 0, amount: 0, fuel: 0, depreciation: 0, labor: 0, parts: 0 },
      groups: [],
    });
  });

  it('pages in the server without repeating or skipping a row and keeps the totals of the whole set', async () => {
    const seen: string[] = [];
    for (const page of [1, 2, 3, 4]) {
      const response = await get(
        `/reports/system-expenses?${inWindow}&pageSize=2&page=${page}`,
      ).expect(200);
      seen.push(...response.body.items.map((row: { id: string }) => row.id));
      expect(response.body).toMatchObject({ total: 8, page, pageSize: 2 });
      expect(response.body.summary.totals.amount).toBe(7986.5);
    }

    expect(new Set(seen).size).toBe(8);
    const all = await get(`/reports/system-expenses?${inWindow}`).expect(200);
    expect(seen).toEqual(all.body.items.map((row: { id: string }) => row.id));
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/system-expenses?from=2031-03-10&to=2031-03-01').expect(400);
    await get('/reports/system-expenses?to=2031-02-30').expect(400);
    await get('/reports/system-expenses?branchId=not-an-id').expect(400);
    await get('/reports/system-expenses/pdf?from=2031-03-10&to=2031-03-01').expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, ['/reports/system-expenses', '/reports/system-expenses/pdf']);
  });

  it('exports every filtered expense as a PDF named after the report and the day, grouped by branch', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-expenses/pdf?${inWindow}`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-gastos-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(printed.tables[0]?.rows.map((row) => row.tone ?? 'normal')).toEqual([
      'group',
      'normal',
      'normal',
      'normal',
      'normal',
      'normal',
      'subtotal',
      'group',
      'normal',
      'normal',
      'normal',
      'subtotal',
      'total',
    ]);
    expect(printed.tables[0]?.rows.at(-1)?.cells.at(-1)).toBe('Q 7,986.50');
    expect(printed.notes[0]).toContain('No incluye el salario de los choferes');
  });

  it('names the branch that was chosen in the PDF and prints every row, not only a page', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(
      app,
      `/reports/system-expenses/pdf?branchId=${data.angeles.id}&pageSize=1`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual([`Sucursal: ${data.angeles.name}`]);
    expect(printed.period).toBe('Todos los registros');
    expect(printed.tables[0]?.rows.filter((row) => row.tone === undefined)).toHaveLength(5);
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-expenses/pdf?branchId=${randomUUID()}`,
    ).expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_repair_lines
        (expense_id, line_no, branch_id, bus_id, service_date, category_id, category_name, kind,
         description, amount)
      SELECT gen_random_uuid(), 0, ${hugeBranchId}::uuid, gen_random_uuid(), '2030-01-01'::date,
             gen_random_uuid(), 'Llantas', 'PART', 'x', 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get(`/reports/system-expenses/pdf?branchId=${hugeBranchId}`).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/system-expenses/pdf?branchId=${randomUUID()}`).expect(200);
  });
});
