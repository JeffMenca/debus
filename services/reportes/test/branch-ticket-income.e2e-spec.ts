import { randomUUID } from 'node:crypto';
import {
  REPORT_PDF_MAX_ROWS,
  branchTicketIncomePageSchema,
  exampleBus,
  exampleCounterTicketSold,
  exampleTicketSold,
  exampleTripDeleted,
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

describe('branch ticket income report', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branchId: string;
  let otherBranchId: string;
  let hugeBranchId: string;
  let bus1: string;
  let bus2: string;
  let trip1: string;
  let trip2: string;
  const routeQuetzal = randomUUID();
  const routeAntigua = randomUUID();

  const http = () => request(app.getHttpServer());
  const asAdmin = (branch: string) => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branch);
  const get = (path: string, branch = branchId) => http().get(path).set(asAdmin(branch));
  const trips = (body: { items: { tripId: string }[] }) => body.items.map((r) => r.tripId);
  const figures = (
    body: {
      items: { tripId: string; tickets: number; onlineTickets: number; counterTickets: number }[];
    },
    ids: Record<string, string>,
  ) => {
    const names = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
    return body.items.map((row) => [
      names[row.tripId],
      row.tickets,
      row.onlineTickets,
      row.counterTickets,
    ]);
  };

  const addBus = (branch: string, plate: string) => {
    const busId = randomUUID();
    return bus
      .deliver('BusAdded', { ...exampleBus, busId, branchId: branch, plate })
      .then(() => busId);
  };
  const sell = (
    channel: 'ONLINE' | 'COUNTER',
    trip: {
      branch: string;
      tripId: string;
      routeId: string;
      busId: string;
      origin: string;
      destination: string;
      departureAt: string;
    },
    seats: number,
    total: number,
    paidOn: string,
  ) =>
    bus.deliver('TicketSold', {
      ...(channel === 'ONLINE' ? exampleTicketSold : exampleCounterTicketSold),
      ticketId: randomUUID(),
      tripId: trip.tripId,
      routeId: trip.routeId,
      branchId: trip.branch,
      busId: trip.busId,
      originLabel: trip.origin,
      destinationLabel: trip.destination,
      departureAt: trip.departureAt,
      seats: Array.from({ length: seats }, (_, index) => index + 1),
      unitPrice: total / seats,
      total,
      paidOn,
    });
  const deleteTrip = (tripId: string, branch: string, busId: string) =>
    bus.deliver('TripDeleted', { ...exampleTripDeleted, tripId, branchId: branch, busId });

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branchId = await seedTestBranch(bus, 'ticket income');
    otherBranchId = await seedTestBranch(bus, 'ticket income other');
    hugeBranchId = await seedTestBranch(bus, 'ticket income huge');

    bus1 = await addBus(branchId, 'P111AAA');
    bus2 = await addBus(branchId, 'P222BBB');
    trip1 = randomUUID();
    trip2 = randomUUID();
    const trip3 = randomUUID();
    const trip4 = randomUUID();
    const quetzal = {
      branch: branchId,
      routeId: routeQuetzal,
      origin: 'Quetzaltenango',
      destination: 'Guatemala',
    };
    const antigua = {
      branch: branchId,
      routeId: routeAntigua,
      origin: 'Quetzaltenango',
      destination: 'Antigua Guatemala',
    };
    const first = {
      ...quetzal,
      tripId: trip1,
      busId: bus1,
      departureAt: '2026-10-20T11:30:00.000Z',
    };
    const second = {
      ...antigua,
      tripId: trip2,
      busId: bus2,
      departureAt: '2026-10-22T09:00:00.000Z',
    };
    const refunded = {
      ...quetzal,
      tripId: trip3,
      busId: bus1,
      departureAt: '2026-10-25T09:00:00.000Z',
    };
    const lateRefund = {
      ...quetzal,
      tripId: trip4,
      busId: bus1,
      departureAt: '2026-10-26T09:00:00.000Z',
    };

    await sell('ONLINE', first, 2, 170, '2026-10-10');
    await sell('COUNTER', first, 1, 85, '2026-10-12');
    await sell('ONLINE', second, 3, 300, '2026-10-12');
    // A trip that was deleted refunds its tickets: before or after the sale reaches the report.
    await sell('ONLINE', refunded, 1, 85, '2026-10-11');
    await deleteTrip(trip3, branchId, bus1);
    await deleteTrip(trip4, branchId, bus1);
    await sell('ONLINE', lateRefund, 1, 85, '2026-10-11');

    const foreignBus = await addBus(otherBranchId, 'P999ZZZ');
    await sell(
      'ONLINE',
      {
        branch: otherBranchId,
        routeId: routeQuetzal,
        tripId: randomUUID(),
        busId: foreignBus,
        origin: 'Quetzaltenango',
        destination: 'Guatemala',
        departureAt: '2026-10-21T09:00:00.000Z',
      },
      4,
      340,
      '2026-10-12',
    );
  });
  afterAll(async () => {
    await cleanReportesTestData(prisma, [branchId, otherBranchId, hugeBranchId]);
    await app.close();
  });

  it('adds up the tickets of each trip, the latest departure first, without the refunded trips', async () => {
    const response = await get('/reports/branch-ticket-income').expect(200);
    const page = branchTicketIncomePageSchema.parse(response.body);

    expect(trips(response.body)).toEqual([trip2, trip1]);
    expect(page.items[1]).toEqual({
      tripId: trip1,
      departureAt: '2026-10-20T11:30:00.000Z',
      routeId: routeQuetzal,
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      busId: bus1,
      busPlate: 'P111AAA',
      tickets: 3,
      onlineTickets: 2,
      counterTickets: 1,
      income: 255,
    });
    expect(page.items[0]).toMatchObject({ busPlate: 'P222BBB', tickets: 3, income: 300 });
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(page.summary.totals).toEqual({ trips: 2, tickets: 6, income: 555 });
    expect(page.summary.groups).toEqual([
      {
        routeId: routeAntigua,
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Antigua Guatemala',
        tickets: 3,
        income: 300,
      },
      {
        routeId: routeQuetzal,
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Guatemala',
        tickets: 3,
        income: 255,
      },
    ]);
  });

  it('never shows the sales of another branch', async () => {
    const response = await get('/reports/branch-ticket-income', otherBranchId).expect(200);

    expect(response.body.summary.totals).toEqual({ trips: 1, tickets: 4, income: 340 });
  });

  it('filters by the day the tickets were paid, both ends included', async () => {
    const day = await get('/reports/branch-ticket-income?from=2026-10-12&to=2026-10-12').expect(
      200,
    );
    expect(figures(day.body, { trip1, trip2 })).toEqual([
      ['trip2', 3, 3, 0],
      ['trip1', 1, 0, 1],
    ]);
    expect(day.body.items[1].income).toBe(85);
    expect(day.body.summary.totals).toEqual({ trips: 2, tickets: 4, income: 385 });

    const upTo = await get('/reports/branch-ticket-income?to=2026-10-10').expect(200);
    expect(figures(upTo.body, { trip1, trip2 })).toEqual([['trip1', 2, 2, 0]]);

    const from = await get('/reports/branch-ticket-income?from=2026-10-13').expect(200);
    expect(from.body.items).toEqual([]);
  });

  it('keeps only the chosen route and recalculates the totals and the groups', async () => {
    const response = await get(`/reports/branch-ticket-income?routeId=${routeQuetzal}`).expect(200);

    expect(trips(response.body)).toEqual([trip1]);
    expect(response.body.summary.totals).toEqual({ trips: 1, tickets: 3, income: 255 });
    expect(response.body.summary.groups).toHaveLength(1);
  });

  it('keeps only the chosen bus and recalculates the totals and the groups', async () => {
    const response = await get(`/reports/branch-ticket-income?busId=${bus2}`).expect(200);

    expect(trips(response.body)).toEqual([trip2]);
    expect(response.body.summary.totals).toEqual({ trips: 1, tickets: 3, income: 300 });
    expect(response.body.summary.groups.map((g: { routeId: string }) => g.routeId)).toEqual([
      routeAntigua,
    ]);
  });

  it('combines the route and the bus filters', async () => {
    const none = await get(
      `/reports/branch-ticket-income?routeId=${routeQuetzal}&busId=${bus2}`,
    ).expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0 });
    expect(none.body.summary).toEqual({
      totals: { trips: 0, tickets: 0, income: 0 },
      groups: [],
    });

    const both = await get(
      `/reports/branch-ticket-income?routeId=${routeQuetzal}&busId=${bus1}`,
    ).expect(200);
    expect(trips(both.body)).toEqual([trip1]);
  });

  it('pages in the server and keeps the totals of the whole filtered set', async () => {
    const second = await get('/reports/branch-ticket-income?pageSize=1&page=2').expect(200);

    expect(trips(second.body)).toEqual([trip1]);
    expect(second.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(second.body.summary.totals).toEqual({ trips: 2, tickets: 6, income: 555 });
  });

  it('lists a trip whose bus the read model does not know with an empty plate', async () => {
    const unknown = randomUUID();
    await sell(
      'ONLINE',
      {
        branch: hugeBranchId,
        routeId: routeQuetzal,
        tripId: randomUUID(),
        busId: unknown,
        origin: 'Quetzaltenango',
        destination: 'Guatemala',
        departureAt: '2026-10-21T09:00:00.000Z',
      },
      1,
      85,
      '2026-10-12',
    );

    const response = await get('/reports/branch-ticket-income', hugeBranchId).expect(200);

    expect(response.body.items[0]).toMatchObject({ busId: unknown, busPlate: null, tickets: 1 });
  });

  it('refuses a range that goes backwards, a day that does not exist or an id that is not one', async () => {
    await get('/reports/branch-ticket-income?from=2026-10-10&to=2026-10-01').expect(400);
    await get('/reports/branch-ticket-income?from=2026-13-01').expect(400);
    await get('/reports/branch-ticket-income?routeId=not-an-id').expect(400);
    await get('/reports/branch-ticket-income?busId=not-an-id').expect(400);
    await get('/reports/branch-ticket-income/pdf?from=2026-10-10&to=2026-10-01').expect(400);
  });

  it.each(['CASHIER', 'SYSTEM_ADMIN'])('refuses the role %s', async (role) => {
    const headers = identityHeaders(randomUUID(), role, role === 'CASHIER' ? branchId : undefined);

    await http().get('/reports/branch-ticket-income').set(headers).expect(403);
    await http().get('/reports/branch-ticket-income/pdf').set(headers).expect(403);
  });

  it('refuses a request without a session', async () => {
    await http().get('/reports/branch-ticket-income').expect(401);
  });

  const getPdf = (path: string, branch = branchId) =>
    get(path, branch)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('exports every filtered trip as a PDF named after the report and the day', async () => {
    const response = await getPdf('/reports/branch-ticket-income/pdf').expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-ingresos-boletos-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports the PDF of a filtered report, naming the route and the bus that were chosen', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    // The Antigua route is not the latest sale of the branch: a label query that ignored the
    // chosen route would print the Quetzaltenango - Guatemala one.
    const response = await getPdf(
      `/reports/branch-ticket-income/pdf?routeId=${routeAntigua}&busId=${bus2}&from=2026-10-01&to=2026-10-31`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.filters).toEqual(['Ruta: Quetzaltenango – Antigua Guatemala', 'Bus: P-222BBB']);
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('exports a PDF with the message of an empty result when nothing matches', async () => {
    const response = await getPdf(
      `/reports/branch-ticket-income/pdf?routeId=${randomUUID()}&busId=${randomUUID()}`,
    ).expect(200);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('asks for narrower filters instead of building a PDF over the row cap', async () => {
    await prisma.$executeRaw`
      INSERT INTO branch_report_ticket_sales
        (id, trip_id, route_id, branch_id, bus_id, origin_label, destination_label, departure_at,
         channel, seats, total, paid_on, sold_at)
      SELECT gen_random_uuid(), gen_random_uuid(), ${routeQuetzal}::uuid, ${hugeBranchId}::uuid,
             gen_random_uuid(), 'A', 'B', now(), 'ONLINE', 1, 1, '2026-10-01'::date, now()
      FROM generate_series(1, ${REPORT_PDF_MAX_ROWS + 1})`;

    const response = await get('/reports/branch-ticket-income/pdf', hugeBranchId).expect(409);

    expect(response.body.message).toBe(REPORT_MESSAGES.tooManyRows);
    await get(`/reports/branch-ticket-income/pdf?busId=${randomUUID()}`, hugeBranchId).expect(200);
  });
});
