import { EVENT_TYPES, architecturePageSchema } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { startReportes } from './support/app';
import { expectOnlySystemAdmin, getAsSystemAdmin, getPdfAsSystemAdmin } from './support/http';

// The report reads the event registry of the contracts, so it writes nothing to the database.
describe('system architecture report', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await startReportes());
  });
  afterAll(async () => {
    await app.close();
  });

  it('pages every event with its topic, subscriptions and effect', async () => {
    const response = await getAsSystemAdmin(
      app,
      '/reports/system-architecture?pageSize=10&page=3',
    ).expect(200);
    const page = architecturePageSchema.parse(response.body);

    expect(page.total).toBe(EVENT_TYPES.length);
    expect(page.items.map((row) => row.type)).toEqual(EVENT_TYPES.slice(20, 30));
    expect(page.summary.totals.events).toBe(EVENT_TYPES.length);
  });

  it('keeps the events of a service and of a single event', async () => {
    const byEvent = await getAsSystemAdmin(
      app,
      '/reports/system-architecture?event=TicketSold',
    ).expect(200);
    expect(architecturePageSchema.parse(byEvent.body).summary.totals).toEqual({
      events: 1,
      subscriptions: 3,
    });

    const byService = await getAsSystemAdmin(
      app,
      '/reports/system-architecture?service=clientes',
    ).expect(200);
    const types = architecturePageSchema.parse(byService.body).items.map((row) => row.type);
    expect(types).toContain('RefundRequested');
    expect(types).not.toContain('RouteCreated');
  });

  it('refuses an unknown service or event', async () => {
    await getAsSystemAdmin(app, '/reports/system-architecture?service=nope').expect(400);
    await getAsSystemAdmin(app, '/reports/system-architecture/pdf?event=Nope').expect(400);
  });

  it('exports the filtered events as a PDF', async () => {
    const response = await getPdfAsSystemAdmin(
      app,
      '/reports/system-architecture/pdf?service=ventas',
    )
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(response.headers['content-disposition']).toMatch(/reporte-arquitectura-/);
  });

  it('is only for the system administrator', async () => {
    await expectOnlySystemAdmin(app, [
      '/reports/system-architecture',
      '/reports/system-architecture/pdf',
    ]);
  });
});
