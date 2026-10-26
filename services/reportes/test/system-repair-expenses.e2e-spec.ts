import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  exampleBus,
  exampleRepairExpenseAdded,
  systemRepairExpensesPageSchema,
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
import { WINDOW, addBranch } from './support/system-finance-fixture';

describe('system repair expenses by category report', () => {
  let app: INestApplication;
  let isolated: IsolatedReportesApp;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchX: { id: string; name: string };
  let branchY: { id: string; name: string };
  let hugeBranchId: string;
  let busX: string;
  let busY: string;
  const acid = randomUUID();
  const tires = randomUUID();
  const engine = randomUUID();

  const inWindow = `from=${WINDOW.from}&to=${WINDOW.to}`;
  const get = (path: string) => getAsSystemAdmin(app, path);
  const spend = (
    branch: { id: string },
    busId: string,
    serviceDate: string,
    lines: [categoryId: string, name: string, kind: 'LABOR' | 'PART', amount: number][],
  ) => {
    const total = lines.reduce((sum, [, , , amount]) => sum + amount, 0);
    return bus.deliver('RepairExpenseAdded', {
      ...exampleRepairExpenseAdded,
      expenseId: randomUUID(),
      branchId: branch.id,
      busId,
      serviceDate,
      total,
      lines: lines.map(([categoryId, categoryName, kind, amount]) => ({
        categoryId,
        categoryName,
        kind,
        description: `${categoryName} ${kind}`,
        amount,
      })),
    });
  };
  const addBus = async (branchId: string, plate: string) => {
    const busId = randomUUID();
    await bus.deliver('BusAdded', { ...exampleBus, busId, branchId, plate });
    return busId;
  };
  const lineKey = (row: { categoryName: string; serviceDate: string; amount: number }) => [
    row.categoryName,
    row.serviceDate,
    row.amount,
  ];

  beforeAll(async () => {
    isolated = await startIsolatedReportes('repair');
    ({ app, prisma, bus } = isolated);
    branchX = await addBranch(bus, 'taller X');
    branchY = await addBranch(bus, 'taller Y');
    hugeBranchId = (await addBranch(bus, 'taller enorme')).id;
    busX = await addBus(branchX.id, 'P111AAA');
    busY = await addBus(branchY.id, 'P222BBB');

    await spend(branchX, busX, '2031-03-10', [
      [tires, 'Llantas', 'PART', 5200],
      [engine, 'Motor', 'LABOR', 350.5],
    ]);
    await spend(branchX, busX, '2031-03-12', [[tires, 'Llantas', 'LABOR', 400]]);
    await spend(branchY, busY, '2031-03-11', [
      [acid, 'Ácido de batería', 'PART', 120],
      [tires, 'Llantas', 'PART', 800],
    ]);
    // The category was renamed: its latest expense names it everywhere.
    await spend(branchX, busX, '2031-03-20', [[engine, 'Motor y transmisión', 'PART', 1000]]);
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('lists a row per line ordered by category without accents, then the latest service first', async () => {
    const response = await get(`/reports/system-repair-expenses?${inWindow}`).expect(200);
    const page = systemRepairExpensesPageSchema.parse(response.body);

    expect(page.items.map(lineKey)).toEqual([
      ['Ácido de batería', '2031-03-11', 120],
      ['Llantas', '2031-03-12', 400],
      ['Llantas', '2031-03-11', 800],
      ['Llantas', '2031-03-10', 5200],
      ['Motor y transmisión', '2031-03-20', 1000],
      ['Motor y transmisión', '2031-03-10', 350.5],
    ]);
    expect(page.items[3]).toMatchObject({
      categoryId: tires,
      busId: busX,
      busPlate: 'P111AAA',
      branchId: branchX.id,
      branchName: branchX.name,
      kind: 'PART',
      description: 'Llantas PART',
      lineNo: 0,
    });
    expect(page).toMatchObject({ total: 6, page: 1, pageSize: 20 });
  });

  it('adds the totals and a subtotal per category with its most recent name', async () => {
    const response = await get(`/reports/system-repair-expenses?${inWindow}`).expect(200);

    expect(response.body.summary.totals).toEqual({ lines: 6, expenses: 4, amount: 7870.5 });
    expect(response.body.summary.groups).toEqual([
      { categoryId: acid, categoryName: 'Ácido de batería', lines: 1, amount: 120 },
      { categoryId: tires, categoryName: 'Llantas', lines: 3, amount: 6400 },
      { categoryId: engine, categoryName: 'Motor y transmisión', lines: 2, amount: 1350.5 },
    ]);
  });

  it('keeps only the chosen branch and recalculates the totals and the groups', async () => {
    const response = await get(
      `/reports/system-repair-expenses?${inWindow}&branchId=${branchY.id}`,
    ).expect(200);

    expect(response.body.items.map(lineKey)).toEqual([
      ['Ácido de batería', '2031-03-11', 120],
      ['Llantas', '2031-03-11', 800],
    ]);
    expect(response.body.summary.totals).toEqual({ lines: 2, expenses: 1, amount: 920 });
    expect(response.body.summary.groups).toHaveLength(2);
  });

  it('keeps only the chosen bus, and the two filters together', async () => {
    const byBus = await get(`/reports/system-repair-expenses?${inWindow}&busId=${busY}`).expect(
      200,
    );
    expect(byBus.body.summary.totals.amount).toBe(920);

    const both = await get(
      `/reports/system-repair-expenses?${inWindow}&branchId=${branchX.id}&busId=${busX}`,
    ).expect(200);
    expect(both.body.summary.totals).toEqual({ lines: 4, expenses: 3, amount: 6950.5 });

    const mismatch = await get(
      `/reports/system-repair-expenses?${inWindow}&branchId=${branchX.id}&busId=${busY}`,
    ).expect(200);
    expect(mismatch.body).toMatchObject({ items: [], total: 0 });
  });

  it('filters by the day of the service, both ends included, and shows everything with no range', async () => {
    const day = await get(
      `/reports/system-repair-expenses?branchId=${branchX.id}&from=2031-03-12&to=2031-03-12`,
    ).expect(200);
    expect(day.body.items.map(lineKey)).toEqual([['Llantas', '2031-03-12', 400]]);

    const upTo = await get(
      `/reports/system-repair-expenses?branchId=${branchX.id}&to=2031-03-10`,
    ).expect(200);
    expect(upTo.body.summary.totals.amount).toBe(5550.5);

    const all = await get(`/reports/system-repair-expenses?branchId=${branchX.id}`).expect(200);
    expect(all.body.total).toBe(4);

    const none = await get(
      `/reports/system-repair-expenses?branchId=${branchX.id}&from=2032-01-01`,
    ).expect(200);
    expect(none.body.summary).toEqual({
      totals: { lines: 0, expenses: 0, amount: 0 },
      groups: [],
    });
  });

  it('pages in the server without repeating or skipping a line and keeps the totals of the whole set', async () => {
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const response = await get(
        `/reports/system-repair-expenses?${inWindow}&pageSize=2&page=${page}`,
      ).expect(200);
      seen.push(
        ...response.body.items.map(
          (row: { expenseId: string; lineNo: number }) => `${row.expenseId}:${row.lineNo}`,
        ),
      );
      expect(response.body).toMatchObject({ total: 6, page, pageSize: 2 });
      expect(response.body.summary.totals.amount).toBe(7870.5);
      expect(response.body.summary.groups).toHaveLength(3);
    }

    expect(new Set(seen).size).toBe(6);
    const all = await get(`/reports/system-repair-expenses?${inWindow}`).expect(200);
    expect(seen).toEqual(
      all.body.items.map(
        (row: { expenseId: string; lineNo: number }) => `${row.expenseId}:${row.lineNo}`,
      ),
    );
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/system-repair-expenses?from=2031-03-10&to=2031-03-01').expect(400);
    await get('/reports/system-repair-expenses?to=2031-02-30').expect(400);
    await get('/reports/system-repair-expenses?branchId=not-an-id').expect(400);
    await get('/reports/system-repair-expenses?busId=not-an-id').expect(400);
    await get('/reports/system-repair-expenses/pdf?from=2031-03-10&to=2031-03-01').expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, [
      '/reports/system-repair-expenses',
      '/reports/system-repair-expenses/pdf',
    ]);
  });

  it('exports every filtered line as a PDF named after the report and the day, grouped by category', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-repair-expenses/pdf?${inWindow}&pageSize=1`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-taller-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(printed.tables[0]?.rows.map((row) => row.tone ?? 'normal')).toEqual([
      'group',
      'normal',
      'subtotal',
      'group',
      'normal',
      'normal',
      'normal',
      'subtotal',
      'group',
      'normal',
      'normal',
      'subtotal',
      'total',
    ]);
    expect(printed.tables[0]?.rows.at(-1)?.cells.at(-1)).toBe('Q 7,870.50');
    expect(printed.period).toBe('Del 1 mar. 2031 al 31 mar. 2031');
  });

  it('names the branch and the bus that were chosen in the PDF', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(
      app,
      `/reports/system-repair-expenses/pdf?branchId=${branchX.id}&busId=${busX}`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual([`Sucursal: ${branchX.name}`, 'Bus: P-111AAA']);
    expect(printed.period).toBe('Todos los registros');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-repair-expenses/pdf?busId=${randomUUID()}&branchId=${randomUUID()}`,
    ).expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_repair_lines
        (expense_id, line_no, branch_id, bus_id, service_date, category_id, category_name, kind,
         description, amount)
      SELECT gen_random_uuid(), 0, ${hugeBranchId}::uuid, gen_random_uuid(), '2030-01-01'::date,
             ${tires}::uuid, 'Llantas', 'PART', 'x', 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get(
      `/reports/system-repair-expenses/pdf?branchId=${hugeBranchId}`,
    ).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/system-repair-expenses/pdf?branchId=${randomUUID()}`).expect(200);
  });
});
