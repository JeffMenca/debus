import {
  type ArchitectureQuery,
  architectureQuerySchema,
  eventFlows,
  filterFlows,
  todayInGuatemala,
} from '@debus/contracts';
import { expect, type Page, test } from '@playwright/test';
import { pdfAnswer } from './support/reports-gateway';
import {
  expectNoHorizontalScroll,
  fulfillJson,
  openMenuOnPhone,
  signInAs,
} from './support/session';

const UNITS = [
  'gateway',
  'administracion',
  'flota',
  'viajes',
  'ventas',
  'clientes',
  'reportes',
  'notificaciones',
];
const isPhone = (page: Page) => (page.viewportSize()?.width ?? Infinity) < 768;

const REPORT = /\/api\/reportes\/reports\/system-architecture(\/pdf)?(\?|$)/;

// The report of the server: the registry filtered and paged, with an effect per event.
function architecturePage(query: ArchitectureQuery) {
  const rows = filterFlows(eventFlows(), query).map((flow) => ({
    ...flow,
    effect: `Efecto de ${flow.type}.`,
  }));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize),
    total: rows.length,
    page: query.page,
    pageSize: query.pageSize,
    summary: {
      totals: {
        events: rows.length,
        subscriptions: rows.reduce((sum, row) => sum + row.consumers.length, 0),
      },
      groups: [],
    },
  };
}

async function open(page: Page, baseURL: string | undefined, search = '') {
  await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
  await page.route(REPORT, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/pdf')) return route.fulfill(pdfAnswer('reporte-arquitectura'));
    const query = architectureQuerySchema.parse(Object.fromEntries(url.searchParams));
    return fulfillJson(route, 200, architecturePage(query));
  });
  await page.route('**/api/system/status', (route) =>
    fulfillJson(route, 200, {
      environment: 'local',
      checkedAt: new Date().toISOString(),
      units: UNITS.map((unit) => ({
        unit,
        status: unit === 'flota' ? 'down' : 'up',
        latencyMs: 12,
        ...(unit === 'ventas' && {
          circuits: [
            { target: 'clientes', state: 'open', failures: 5, retryAt: null },
            { target: 'viajes', state: 'closed', failures: 0, retryAt: null },
          ],
        }),
      })),
    }),
  );
  await page.goto(`/admin/reportes/arquitectura${search}`);
}

test.describe('architecture view', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('draws every service with its live state and lists all the events', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);

    await expect(page.getByRole('heading', { level: 1, name: 'Arquitectura' })).toBeVisible();
    await expect(page.getByRole('group', { name: /Arquitectura de debus/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ventas: en línea' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flota: sin respuesta' })).toBeVisible();
    await expect(page.getByText('Cobrar con la cartera · en pausa')).toBeVisible();
    // Header and the first page of the 27 events of the registry.
    await expect(
      page.getByRole('table', { name: 'Eventos entre servicios' }).getByRole('row'),
    ).toHaveCount(21);
    await expectNoHorizontalScroll(page);
    await page.screenshot({
      path: `test-results/architecture-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  });

  test('narrows the events to the service picked in the diagram and keeps it in the address', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);

    await page.getByRole('button', { name: 'Clientes: en línea' }).click();

    await expect(page).toHaveURL(/servicio=clientes/);
    const table = page.getByRole('table', { name: 'Eventos entre servicios' });
    await expect(table.getByText('RentalPaid', { exact: true })).toBeVisible();
    await expect(table.getByText('RouteCreated', { exact: true })).toHaveCount(0);
  });

  test('shows the topic of the event in the address', async ({ page, baseURL }) => {
    await open(page, baseURL, '?evento=TripDeleted');

    await expect(
      page.getByRole('group', { name: /Arquitectura de debus/ }).getByText('viajes-events'),
    ).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Eventos entre servicios' }).getByRole('row'),
    ).toHaveCount(2);
  });

  test('pages the events on the server and exports every filtered event', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '?pagina=2');

    await expect(
      page.getByRole('table', { name: 'Eventos entre servicios' }).getByRole('row'),
    ).toHaveCount(8);

    const pdf = page.waitForRequest(/system-architecture\/pdf/);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(
      `reporte-arquitectura-${todayInGuatemala()}.pdf`,
    );
    expect(new URL((await pdf).url()).searchParams.has('page')).toBe(false);
  });

  test('is in the reports menu', async ({ page, baseURL }) => {
    await open(page, baseURL);
    if (isPhone(page)) await openMenuOnPhone(page);

    await expect(
      page.getByRole('link', { name: 'Arquitectura', exact: true }).first(),
    ).toBeVisible();
  });
});
