import { randomUUID } from 'node:crypto';
import {
  exampleBranch,
  exampleRoute,
  exampleTripDeleted,
  systemRoutesMapSchema,
  todayInGuatemala,
} from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import { PdfRenderer } from '../src/common/pdf/pdf-renderer';
import type { ReportDocument } from '../src/common/pdf/report-document';
import { expectOnlySystemAdmin, getAsSystemAdmin, getPdfAsSystemAdmin } from './support/http';
import { type IsolatedReportesApp, startIsolatedReportes } from './support/isolated-app';
import { type FixtureBranch, addBranch, sellTickets } from './support/system-finance-fixture';

// The map picks a branch among all of them, so each group works on a schema of its own.
describe('system routes map report', () => {
  let isolated: IsolatedReportesApp;
  let app: INestApplication;
  let bus: InMemoryEventBus;
  let angeles: FixtureBranch;
  let boca: { id: string; name: string };
  let cumbre: { id: string; name: string };
  let dormida: { id: string; name: string };
  let cerrada: { id: string; name: string };
  const toBoca = randomUUID();
  const toCumbre = randomUUID();
  const toDormida = randomUUID();
  const toGhost = randomUUID();
  const deactivated = randomUUID();
  const deleted = randomUUID();
  const ghostBranchId = randomUUID();

  const get = (path: string) => getAsSystemAdmin(app, path);
  const route = (routeId: string, from: { id: string }, to: string, over = {}) => ({
    ...exampleRoute,
    routeId,
    originBranchId: from.id,
    destinationBranchId: to,
    ...over,
  });

  beforeAll(async () => {
    isolated = await startIsolatedReportes('routesmap');
    ({ app, bus } = isolated);
    const a = await addBranch(bus, 'Ángeles mapa');
    angeles = { ...a, busId: randomUUID(), plate: 'P111AAA' };
    boca = await addBranch(bus, 'Boca mapa');
    cumbre = await addBranch(bus, 'Cumbre mapa');
    dormida = await addBranch(bus, 'Dormida mapa', false);
    cerrada = await addBranch(bus, 'Cerrada mapa', false);

    await bus.deliver(
      'RouteCreated',
      route(toBoca, angeles, boca.id, { distanceKm: 201.5, ticketPrice: 85 }),
    );
    await bus.deliver(
      'RouteCreated',
      route(toCumbre, angeles, cumbre.id, { distanceKm: 92, ticketPrice: 40 }),
    );
    await bus.deliver(
      'RouteCreated',
      route(toDormida, angeles, dormida.id, { distanceKm: 30, ticketPrice: 20 }),
    );
    await bus.deliver('RouteCreated', route(toGhost, angeles, ghostBranchId));
    await bus.deliver('RouteCreated', route(deactivated, angeles, cumbre.id));
    await bus.deliver(
      'RouteUpdated',
      route(deactivated, angeles, cumbre.id, { active: false, version: 2 }),
    );
    await bus.deliver('RouteCreated', route(deleted, angeles, boca.id));
    await bus.deliver('RouteDeleted', { routeId: deleted, originBranchId: angeles.id });
    // A branch that closed but still runs a route.
    await bus.deliver('RouteCreated', route(randomUUID(), cerrada, angeles.id));

    const trip = randomUUID();
    const sold = (seats: number, tripId = trip) =>
      sellTickets(bus, {
        channel: 'ONLINE',
        branch: angeles,
        tripId,
        seats,
        unitPrice: 85,
        paidOn: '2025-01-05',
        routeId: toBoca,
        destination: 'Boca mapa',
      });
    await sold(2);
    await sold(1);
    const refunded = randomUUID();
    await sold(4, refunded);
    await bus.deliver('TripDeleted', {
      ...exampleTripDeleted,
      tripId: refunded,
      branchId: angeles.id,
      busId: angeles.busId,
    });
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('draws the first branch with active routes when none is chosen', async () => {
    const response = await get('/reports/system-routes-map').expect(200);
    const map = systemRoutesMapSchema.parse(response.body);

    expect(map.selectedBranchId).toBe(angeles.id);
    expect(map.routes.map((item) => item.destinationName)).toEqual([
      boca.name,
      cumbre.name,
      dormida.name,
    ]);
  });

  it('gives each route its destination, coordinates, distance, price and tickets sold on any date', async () => {
    const response = await get(`/reports/system-routes-map?branchId=${angeles.id}`).expect(200);

    expect(response.body.routes[0]).toEqual({
      routeId: toBoca,
      destinationBranchId: boca.id,
      destinationName: boca.name,
      latitude: Number(exampleBranch.latitude),
      longitude: Number(exampleBranch.longitude),
      distanceKm: 201.5,
      ticketPrice: 85,
      tickets: 3,
    });
    expect(response.body.routes[1]).toMatchObject({ routeId: toCumbre, tickets: 0 });
  });

  it('does not draw a route that is inactive, deleted or goes to a branch that was never copied', async () => {
    const response = await get(`/reports/system-routes-map?branchId=${angeles.id}`).expect(200);
    const ids = response.body.routes.map((item: { routeId: string }) => item.routeId);

    expect(ids).toEqual([toBoca, toCumbre, toDormida]);
    expect(ids).not.toContain(deactivated);
    expect(ids).not.toContain(deleted);
    expect(ids).not.toContain(toGhost);
  });

  it('lists the branches alphabetically with their active routes, leaving out a closed one with none', async () => {
    const response = await get('/reports/system-routes-map').expect(200);

    expect(
      response.body.branches.map((item: { name: string; routes: number }) => [
        item.name,
        item.routes,
      ]),
    ).toEqual([
      [angeles.name, 4],
      [boca.name, 0],
      [cerrada.name, 1],
      [cumbre.name, 0],
    ]);
    expect(response.body.branches[0]).toMatchObject({
      id: angeles.id,
      latitude: Number(exampleBranch.latitude),
    });
  });

  it('answers a branch without routes with an empty list of routes', async () => {
    const response = await get(`/reports/system-routes-map?branchId=${cumbre.id}`).expect(200);

    expect(response.body.selectedBranchId).toBe(cumbre.id);
    expect(response.body.routes).toEqual([]);
  });

  it('answers an unknown branch with an empty list of routes', async () => {
    const unknown = randomUUID();

    const response = await get(`/reports/system-routes-map?branchId=${unknown}`).expect(200);

    expect(response.body).toMatchObject({ selectedBranchId: unknown, routes: [] });
  });

  it('refuses an id that is not one', async () => {
    await get('/reports/system-routes-map?branchId=not-an-id').expect(400);
    await get('/reports/system-routes-map/pdf?branchId=not-an-id').expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, [
      '/reports/system-routes-map',
      '/reports/system-routes-map/pdf',
    ]);
  });

  it('exports the table of the routes of the chosen branch as a PDF named after the report and the day', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    const response = await getPdfAsSystemAdmin(
      app,
      `/reports/system-routes-map/pdf?branchId=${angeles.id}`,
    ).expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-mapa-rutas-${todayInGuatemala()}.pdf"`,
    );
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(printed.scope).toBe(`Sucursal de origen: ${angeles.name}`);
    expect(printed.tables[0]?.rows).toHaveLength(4);
    expect(printed.tables[0]?.rows[0]?.cells).toEqual([boca.name, '202 km', 'Q 85.00', '3']);
  });

  it('exports the first branch with routes when none is chosen', async () => {
    const render = jest.spyOn(app.get(PdfRenderer), 'render');

    await getPdfAsSystemAdmin(app, '/reports/system-routes-map/pdf').expect(200);

    const printed = render.mock.calls.at(-1)?.[0] as ReportDocument;
    render.mockRestore();
    expect(printed.scope).toBe(`Sucursal de origen: ${angeles.name}`);
  });
});

describe('system routes map report without routes', () => {
  let isolated: IsolatedReportesApp;
  let app: INestApplication;

  beforeAll(async () => {
    isolated = await startIsolatedReportes('routesmapempty');
    ({ app } = isolated);
  });
  afterAll(async () => {
    await isolated.close();
  });

  it('answers no branch and no routes, and still exports a PDF', async () => {
    const response = await getAsSystemAdmin(app, '/reports/system-routes-map').expect(200);
    expect(response.body).toEqual({ branches: [], selectedBranchId: null, routes: [] });

    const pdf = await getPdfAsSystemAdmin(app, '/reports/system-routes-map/pdf').expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
