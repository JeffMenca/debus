import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  branchRepairExpensesPageSchema,
  exampleBus,
  exampleRepairExpenseAdded,
  todayInGuatemala,
} from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import { identityHeaders } from '@debus/server';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PdfRenderer } from '../src/common/pdf/pdf-renderer';
import type { ReportDocument } from '../src/common/pdf/report-document';
import { REPORT_MESSAGES } from '../src/common/report-messages';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

describe('branch repair expenses report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchId: string;
  let otherBranchId: string;
  let renamedBranchId: string;
  let hugeBranchId: string;
  let volvo: string;
  let hino: string;
  let unknownBus: string;
  const motor = randomUUID();
  const tires = randomUUID();
  const brakes = randomUUID();

  const http = () => request(app.getHttpServer());
  const asAdmin = (branch: string) => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branch);
  const get = (path: string, branch = branchId) => http().get(path).set(asAdmin(branch));
  const plates = (body: { items: { plate: string | null }[] }) => body.items.map((r) => r.plate);
  const figures = (body: { items: { plate: string | null; total: number; expenses: number }[] }) =>
    body.items.map((row) => [row.plate, row.total, row.expenses]);

  const addBus = (branch: string, plate: string, brand: string) => {
    const busId = randomUUID();
    return bus
      .deliver('BusAdded', { ...exampleBus, busId, branchId: branch, plate, brand })
      .then(() => busId);
  };
  const addExpense = (
    branch: string,
    busId: string,
    serviceDate: string,
    lines: [categoryId: string, categoryName: string, amount: number][],
  ) =>
    bus.deliver('RepairExpenseAdded', {
      ...exampleRepairExpenseAdded,
      expenseId: randomUUID(),
      branchId: branch,
      busId,
      serviceDate,
      total: lines.reduce((sum, [, , amount]) => sum + amount, 0),
      lines: lines.map(([categoryId, categoryName, amount]) => ({
        categoryId,
        categoryName,
        kind: 'PART',
        description: 'Repuesto',
        amount,
      })),
    });

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'repair report');
    otherBranchId = await seedTestBranch(bus, 'repair report other');
    renamedBranchId = await seedTestBranch(bus, 'repair report renamed');
    hugeBranchId = await seedTestBranch(bus, 'repair report huge');

    volvo = await addBus(branchId, 'P111AAA', 'Volvo');
    hino = await addBus(branchId, 'P222BBB', 'Hino');
    const foreign = await addBus(otherBranchId, 'P999ZZZ', 'Volvo');

    await addExpense(branchId, volvo, '2026-10-10', [
      [motor, 'Motor', 1200],
      [tires, 'Llantas', 800],
    ]);
    await addExpense(branchId, volvo, '2026-10-15', [[motor, 'Motor', 300]]);
    await addExpense(branchId, hino, '2026-10-12', [[brakes, 'Frenos', 450]]);
    await addExpense(otherBranchId, foreign, '2026-10-12', [[motor, 'Motor', 9000]]);

    // The same category renamed between two expenses, on a bus the read model never heard of.
    unknownBus = randomUUID();
    await addExpense(renamedBranchId, unknownBus, '2026-10-01', [[motor, 'Motor viejo', 100]]);
    await addExpense(renamedBranchId, unknownBus, '2026-10-20', [[motor, 'Motor nuevo', 200]]);
  });
  afterAll(async () => {
    await cleanReportesTestData(prisma, [branchId, otherBranchId, renamedBranchId, hugeBranchId]);
    await app.close();
  });

  it('groups the repairs of each bus by category, the buses that spent most first', async () => {
    const response = await get('/reports/branch-repair-expenses').expect(200);
    const page = branchRepairExpensesPageSchema.parse(response.body);

    expect(figures(response.body)).toEqual([
      ['P111AAA', 2300, 2],
      ['P222BBB', 450, 1],
    ]);
    expect(page.items[0]?.categories).toEqual([
      { categoryId: motor, categoryName: 'Motor', lines: 2, amount: 1500 },
      { categoryId: tires, categoryName: 'Llantas', lines: 1, amount: 800 },
    ]);
    expect(page.items[1]?.categories).toEqual([
      { categoryId: brakes, categoryName: 'Frenos', lines: 1, amount: 450 },
    ]);
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(page.summary.totals).toEqual({ buses: 2, expenses: 3, total: 2750 });
    expect(page.summary.groups).toEqual([
      { categoryId: motor, categoryName: 'Motor', lines: 2, amount: 1500 },
      { categoryId: tires, categoryName: 'Llantas', lines: 1, amount: 800 },
      { categoryId: brakes, categoryName: 'Frenos', lines: 1, amount: 450 },
    ]);
  });

  it('never shows the expenses of another branch', async () => {
    const response = await get('/reports/branch-repair-expenses', otherBranchId).expect(200);

    expect(figures(response.body)).toEqual([['P999ZZZ', 9000, 1]]);
  });

  it('keeps only the lines of the chosen category', async () => {
    const response = await get(`/reports/branch-repair-expenses?categoryId=${motor}`).expect(200);

    expect(figures(response.body)).toEqual([['P111AAA', 1500, 2]]);
    expect(response.body.items[0].categories).toEqual([
      { categoryId: motor, categoryName: 'Motor', lines: 2, amount: 1500 },
    ]);
    expect(response.body.summary.totals).toEqual({ buses: 1, expenses: 2, total: 1500 });
    expect(response.body.summary.groups).toHaveLength(1);
  });

  it('keeps only the chosen bus', async () => {
    const response = await get(`/reports/branch-repair-expenses?busId=${hino}`).expect(200);

    expect(plates(response.body)).toEqual(['P222BBB']);
    expect(response.body.summary.totals).toEqual({ buses: 1, expenses: 1, total: 450 });
  });

  it('filters by the day of the service, both ends included', async () => {
    const middle = await get(
      '/reports/branch-repair-expenses?from=2026-10-11&to=2026-10-14',
    ).expect(200);
    expect(figures(middle.body)).toEqual([['P222BBB', 450, 1]]);

    const from = await get('/reports/branch-repair-expenses?from=2026-10-15').expect(200);
    expect(figures(from.body)).toEqual([['P111AAA', 300, 1]]);

    const upTo = await get('/reports/branch-repair-expenses?to=2026-10-10').expect(200);
    expect(figures(upTo.body)).toEqual([['P111AAA', 2000, 1]]);

    const exact = await get('/reports/branch-repair-expenses?from=2026-10-12&to=2026-10-12').expect(
      200,
    );
    expect(figures(exact.body)).toEqual([['P222BBB', 450, 1]]);
  });

  it('pages in the server and keeps the totals of the whole filtered set', async () => {
    const second = await get('/reports/branch-repair-expenses?pageSize=1&page=2').expect(200);

    expect(figures(second.body)).toEqual([['P222BBB', 450, 1]]);
    expect(second.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(second.body.items[0].categories).toHaveLength(1);
    expect(second.body.summary.totals).toEqual({ buses: 2, expenses: 3, total: 2750 });
  });

  it('shows a renamed category with the name of its most recent expense', async () => {
    const response = await get('/reports/branch-repair-expenses', renamedBranchId).expect(200);

    expect(response.body.items[0].categories).toEqual([
      { categoryId: motor, categoryName: 'Motor nuevo', lines: 2, amount: 300 },
    ]);
    expect(response.body.summary.groups).toEqual([
      { categoryId: motor, categoryName: 'Motor nuevo', lines: 2, amount: 300 },
    ]);
  });

  it('lists a bus the read model does not know with empty names', async () => {
    const response = await get('/reports/branch-repair-expenses', renamedBranchId).expect(200);

    expect(response.body.items[0]).toMatchObject({
      busId: unknownBus,
      plate: null,
      brand: null,
      model: null,
      total: 300,
    });
  });

  it('answers an empty page when the filters match nothing', async () => {
    const response = await get(`/reports/branch-repair-expenses?busId=${randomUUID()}`).expect(200);

    expect(response.body).toMatchObject({ items: [], total: 0 });
    expect(response.body.summary).toEqual({
      totals: { buses: 0, expenses: 0, total: 0 },
      groups: [],
    });
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/branch-repair-expenses?from=2026-10-10&to=2026-10-01').expect(400);
    await get('/reports/branch-repair-expenses?from=2026-13-01').expect(400);
    await get('/reports/branch-repair-expenses?busId=not-an-id').expect(400);
    await get('/reports/branch-repair-expenses?categoryId=not-an-id').expect(400);
    await get('/reports/branch-repair-expenses/pdf?from=2026-10-10&to=2026-10-01').expect(400);
  });

  it.each(['CASHIER', 'SYSTEM_ADMIN'])('refuses the role %s', async (role) => {
    const headers = identityHeaders(randomUUID(), role, role === 'CASHIER' ? branchId : undefined);

    await http().get('/reports/branch-repair-expenses').set(headers).expect(403);
    await http().get('/reports/branch-repair-expenses/pdf').set(headers).expect(403);
  });

  it('refuses a request without a session', async () => {
    await http().get('/reports/branch-repair-expenses').expect(401);
  });

  const getPdf = (path: string, branch = branchId) =>
    get(path, branch)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('exports every filtered bus as a PDF named after the report and the day', async () => {
    const response = await getPdf('/reports/branch-repair-expenses/pdf').expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-taller-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports the PDF of a filtered report, naming the bus and the category that were chosen', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    // "Llantas" is not the newest category of the branch: a label query that ignored the chosen
    // category would print "Motor".
    const response = await getPdf(
      `/reports/branch-repair-expenses/pdf?busId=${volvo}&categoryId=${tires}&from=2026-10-01&to=2026-10-31`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual(['Bus: P-111AAA', 'Categoría: Llantas']);
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdf(
      `/reports/branch-repair-expenses/pdf?busId=${randomUUID()}&categoryId=${randomUUID()}`,
    ).expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_repair_lines
        (expense_id, line_no, branch_id, bus_id, service_date, category_id, category_name, kind, description, amount)
      SELECT gen_random_uuid(), 0, ${hugeBranchId}::uuid, gen_random_uuid(), '2026-10-01'::date,
             ${motor}::uuid, 'Motor', 'PART', 'Repuesto', 1
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get('/reports/branch-repair-expenses/pdf', hugeBranchId).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/branch-repair-expenses/pdf?busId=${randomUUID()}`, hugeBranchId).expect(
      200,
    );
  });
});
