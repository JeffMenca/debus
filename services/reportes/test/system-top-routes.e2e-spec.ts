import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  exampleRoute,
  exampleTripDeleted,
  systemTopRoutesPageSchema,
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
  type FixtureBranch,
  WINDOW,
  addBranch,
  sellTickets,
} from './support/system-finance-fixture';

describe('system top routes report', () => {
  let app: INestApplication;
  let isolated: IsolatedReportesApp;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let origin: FixtureBranch;
  let other: FixtureBranch;
  let hugeBranchId: string;
  // Two routes with the same tickets: the smaller id comes first.
  const tieIds: string[] = [randomUUID(), randomUUID()].sort();
  const tieFirst = tieIds[0] ?? '';
  const tieSecond = tieIds[1] ?? '';
  const guatemala = randomUUID();
  const lonelyRoute = randomUUID();
  const refundedRoute = randomUUID();

  const inWindow = `from=${WINDOW.from}&to=${WINDOW.to}`;
  const get = (path: string) => getAsSystemAdmin(app, path);
  const sell = (
    branch: FixtureBranch,
    routeId: string,
    destination: string,
    channel: 'ONLINE' | 'COUNTER',
    seats: number,
    paidOn: string,
    tripId = randomUUID(),
  ) =>
    sellTickets(bus, {
      channel,
      branch,
      tripId,
      seats,
      unitPrice: 85,
      paidOn,
      routeId,
      destination,
    });
  const branchWithBus = async (label: string): Promise<FixtureBranch> => {
    const branch = await addBranch(bus, label);
    return { ...branch, busId: randomUUID(), plate: 'P111AAA' };
  };

  beforeAll(async () => {
    isolated = await startIsolatedReportes('toproutes');
    ({ app, prisma, bus } = isolated);
    origin = await branchWithBus('rutas origen');
    other = await branchWithBus('rutas otro origen');
    hugeBranchId = (await addBranch(bus, 'rutas enorme')).id;

    // Guatemala: 4 tickets on 2 trips (3 online, 1 at the counter), the most demanded.
    const firstTrip = randomUUID();
    await sell(origin, guatemala, 'Guatemala', 'ONLINE', 2, '2031-03-10', firstTrip);
    await sell(origin, guatemala, 'Guatemala', 'COUNTER', 1, '2031-03-12', firstTrip);
    await sell(origin, guatemala, 'Guatemala', 'ONLINE', 1, '2031-03-20');
    // Two routes tied at 2 tickets.
    await sell(origin, tieFirst, 'Antigua Guatemala', 'COUNTER', 2, '2031-03-11');
    await sell(origin, tieSecond, 'Panajachel', 'ONLINE', 2, '2031-03-11');
    // Another origin.
    await sell(other, lonelyRoute, 'Cobán', 'ONLINE', 1, '2031-03-11');
    // The tickets of a deleted trip are refunded, sold before or after the deletion.
    const refundedBefore = randomUUID();
    const refundedAfter = randomUUID();
    await sell(origin, refundedRoute, 'Esquipulas', 'ONLINE', 1, '2031-03-11', refundedBefore);
    for (const tripId of [refundedBefore, refundedAfter]) {
      await bus.deliver('TripDeleted', {
        ...exampleTripDeleted,
        tripId,
        branchId: origin.id,
        busId: origin.busId,
      });
    }
    await sell(origin, refundedRoute, 'Esquipulas', 'ONLINE', 1, '2031-03-11', refundedAfter);

    // The routes: Guatemala changed its price, the second tied one is inactive, the first tied one
    // never arrived, and the lonely one was deleted.
    const route = (routeId: string, destinationBranchId: string) => ({
      ...exampleRoute,
      routeId,
      originBranchId: origin.id,
      destinationBranchId,
    });
    await bus.deliver('RouteCreated', route(guatemala, other.id));
    await bus.deliver('RouteUpdated', {
      ...route(guatemala, other.id),
      ticketPrice: 90,
      version: 2,
    });
    await bus.deliver('RouteCreated', {
      ...route(tieSecond, other.id),
      distanceKm: 36,
      ticketPrice: 40,
      version: 1,
    });
    await bus.deliver('RouteUpdated', {
      ...route(tieSecond, other.id),
      distanceKm: 36,
      ticketPrice: 40,
      active: false,
      version: 2,
    });
    await bus.deliver('RouteCreated', route(lonelyRoute, origin.id));
    await bus.deliver('RouteDeleted', { routeId: lonelyRoute, originBranchId: origin.id });
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('ranks the routes by tickets from most to least, breaking ties by route id', async () => {
    const response = await get(`/reports/system-top-routes?${inWindow}`).expect(200);
    const page = systemTopRoutesPageSchema.parse(response.body);

    expect(page.items.map((row) => [row.position, row.routeId, row.tickets])).toEqual([
      [1, guatemala, 4],
      [2, tieFirst, 2],
      [3, tieSecond, 2],
      [4, lonelyRoute, 1],
    ]);
    expect(page.items[0]).toMatchObject({
      branchId: origin.id,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      trips: 2,
      onlineTickets: 3,
      counterTickets: 1,
      income: 340,
    });
    expect(page).toMatchObject({ total: 4, page: 1, pageSize: 20 });
  });

  it('leaves out a route whose only tickets belong to a deleted trip', async () => {
    const response = await get(`/reports/system-top-routes?${inWindow}`).expect(200);

    expect(response.body.items.map((row: { routeId: string }) => row.routeId)).not.toContain(
      refundedRoute,
    );
  });

  it('adds up the totals and the share of every route, which sums to one hundred percent', async () => {
    const response = await get(`/reports/system-top-routes?${inWindow}`).expect(200);

    expect(response.body.summary.totals).toEqual({ routes: 4, trips: 5, tickets: 9, income: 765 });
    expect(response.body.summary.groups).toEqual([]);
    const shares = response.body.items.map((row: { share: number }) => row.share);
    expect(shares).toEqual([44.4, 22.2, 22.2, 11.1]);
    expect(shares.reduce((sum: number, share: number) => sum + share, 0)).toBeCloseTo(100, 0);
    const tickets = response.body.items.reduce(
      (sum: number, row: { tickets: number }) => sum + row.tickets,
      0,
    );
    expect(tickets).toBe(response.body.summary.totals.tickets);
  });

  it('takes the distance, the price and the state from the copy of the routes, or null if it has none', async () => {
    const response = await get(`/reports/system-top-routes?${inWindow}`).expect(200);
    const byRoute = new Map(
      response.body.items.map((row: { routeId: string }) => [row.routeId, row] as const),
    );

    expect(byRoute.get(guatemala)).toMatchObject({
      distanceKm: 201.5,
      ticketPrice: 90,
      active: true,
    });
    expect(byRoute.get(tieSecond)).toMatchObject({
      distanceKm: 36,
      ticketPrice: 40,
      active: false,
    });
    expect(byRoute.get(tieFirst)).toMatchObject({
      distanceKm: null,
      ticketPrice: null,
      active: null,
    });
    expect(byRoute.get(lonelyRoute)).toMatchObject({
      distanceKm: null,
      ticketPrice: null,
      active: null,
    });
  });

  it('keeps only the routes of the chosen origin branch and recalculates the shares', async () => {
    const response = await get(
      `/reports/system-top-routes?${inWindow}&branchId=${other.id}`,
    ).expect(200);

    expect(response.body.items.map((row: { routeId: string }) => row.routeId)).toEqual([
      lonelyRoute,
    ]);
    expect(response.body.items[0]).toMatchObject({ position: 1, share: 100 });
    expect(response.body.summary.totals).toEqual({ routes: 1, trips: 1, tickets: 1, income: 85 });
  });

  it('filters by the day the tickets were paid, both ends included', async () => {
    const response = await get(
      `/reports/system-top-routes?branchId=${origin.id}&from=2031-03-10&to=2031-03-12`,
    ).expect(200);

    expect(response.body.items[0]).toMatchObject({ routeId: guatemala, tickets: 3, trips: 1 });
    expect(response.body.summary.totals.tickets).toBe(7);

    const empty = await get(
      `/reports/system-top-routes?branchId=${origin.id}&from=2032-01-01`,
    ).expect(200);
    expect(empty.body).toMatchObject({ items: [], total: 0 });
    expect(empty.body.summary.totals).toEqual({ routes: 0, trips: 0, tickets: 0, income: 0 });
  });

  it('shows every record of a branch when the range is empty', async () => {
    const response = await get(`/reports/system-top-routes?branchId=${origin.id}`).expect(200);

    expect(response.body.summary.totals.tickets).toBe(8);
  });

  it('pages in the server keeping the position of the whole ranking and the totals of the whole set', async () => {
    const second = await get(`/reports/system-top-routes?${inWindow}&pageSize=2&page=2`).expect(
      200,
    );

    expect(second.body.items.map((row: { position: number }) => row.position)).toEqual([3, 4]);
    expect(second.body.items.map((row: { routeId: string }) => row.routeId)).toEqual([
      tieSecond,
      lonelyRoute,
    ]);
    expect(second.body).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(second.body.summary.totals.tickets).toBe(9);
    expect(second.body.items[0].share).toBe(22.2);
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/system-top-routes?from=2031-03-10&to=2031-03-01').expect(400);
    await get('/reports/system-top-routes?to=2031-02-30').expect(400);
    await get('/reports/system-top-routes?branchId=not-an-id').expect(400);
    await get('/reports/system-top-routes/pdf?from=2031-03-10&to=2031-03-01').expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, [
      '/reports/system-top-routes',
      '/reports/system-top-routes/pdf',
    ]);
  });

  it('exports every filtered route as a PDF named after the report and the day, with a total row', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-top-routes/pdf?${inWindow}&pageSize=1`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-rutas-demandadas-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(printed.tables[0]?.rows).toHaveLength(5);
    expect(printed.tables[0]?.rows.at(-1)).toMatchObject({ tone: 'total' });
    expect(printed.tables[0]?.rows[0]?.cells[1]).toBe('Quetzaltenango – Guatemala');
  });

  it('names the origin branch that was chosen in the PDF and exports an empty result as a PDF', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(app, `/reports/system-top-routes/pdf?branchId=${other.id}`).expect(
      200,
    );
    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual([`Sucursal de origen: ${other.name}`]);

    const empty = await getPdfAsSystemAdmin(
      app,
      `/reports/system-top-routes/pdf?branchId=${randomUUID()}`,
    ).expect(200);
    expect((empty.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_ticket_sales
        (id, trip_id, route_id, branch_id, bus_id, origin_label, destination_label, departure_at,
         channel, seats, total, paid_on, sold_at)
      SELECT gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), ${hugeBranchId}::uuid,
             gen_random_uuid(), 'A', 'B', now(), 'ONLINE', 1, 1, '2030-01-01'::date, now()
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get(`/reports/system-top-routes/pdf?branchId=${hugeBranchId}`).expect(
      409,
    );

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/system-top-routes/pdf?branchId=${randomUUID()}`).expect(200);
  });
});
