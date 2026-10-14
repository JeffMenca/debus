import { type Page, expect, test } from '@playwright/test';
import { todayInGuatemala } from '@debus/contracts';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import { FLEET_BRANCH_ID } from './support/fleet-gateway';
import { type ReportsSeed, mockReportsGateway, sampleBusRow } from './support/reports-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const REPORTS = '/sucursal/reportes';

async function open(page: Page, baseURL: string | undefined, path: string, seed: ReportsSeed = {}) {
  await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
  const gateway = await mockReportsGateway(page, seed);
  await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
  await page.goto(path);
  return gateway;
}

const manyBuses = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    sampleBusRow({ plate: `C${String(100 + index)}BTX`, brand: index % 2 ? 'Hino' : 'Volvo' }),
  );

test.describe('branch report: buses', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  const seed: ReportsSeed = {
    buses: [
      ...manyBuses(24),
      sampleBusRow({ plate: 'C900WRK', status: 'IN_WORKSHOP', driverName: 'Ana Pérez' }),
      sampleBusRow({ plate: 'C901RTE', status: 'IN_TRANSIT', mileageKm: 1204 }),
    ],
  };

  test('shows the buses with the count of each status and filters by one of them', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${REPORTS}/buses`, seed);

    await expect(page.getByRole('heading', { level: 1, name: 'Listado de buses' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Buses' }).getByRole('row')).toHaveCount(21);
    await expect(page.getByRole('tab', { name: /Todos/ })).toContainText('26');
    await expect(page.getByRole('tab', { name: /En taller/ })).toContainText('1');

    await page.getByRole('tab', { name: /En taller/ }).click();

    await expect(page).toHaveURL(/estado=en-taller/);
    await expect(page.getByRole('row', { name: /C-900WRK/ })).toContainText('Ana Pérez');
    const last = gateway.reports().at(-1)!;
    expect(new URLSearchParams(last.query).get('status')).toBe('IN_WORKSHOP');
    expect(new URLSearchParams(last.query).get('page')).toBe('1');
    await expect(page.getByRole('tab', { name: /Todos/ })).toContainText('26');
    await expectNoHorizontalScroll(page);
  });

  test('dims the table while the second page loads, without going back to the skeleton', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${REPORTS}/buses`, { ...seed, pageDelayMs: 800 });
    await expect(page.getByRole('row', { name: /C-100BTX/ })).toBeVisible();

    await page.getByRole('button', { name: 'Página siguiente' }).click();

    await expect(page).toHaveURL(/pagina=2/);
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(page.getByLabel('Cargando')).toHaveCount(0);
    await expect(page.getByRole('row', { name: /C-901RTE/ })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(new URLSearchParams(gateway.reports().at(-1)!.query).get('page')).toBe('2');
    await expect(page.getByLabel('Cargando')).toHaveCount(0);
  });

  test('exports the PDF with the filters on screen and names it after the report and the day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${REPORTS}/buses?estado=en-taller`, seed);
    await expect(page.getByRole('row', { name: /C-900WRK/ })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(`reporte-buses-${todayInGuatemala()}.pdf`);
    const [pdf] = gateway.pdfs();
    expect(new URLSearchParams(pdf!.query).get('status')).toBe('IN_WORKSHOP');
  });

  test('explains with the text of the server when the PDF is too big', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, `${REPORTS}/buses`, {
      ...seed,
      pdfRefusal: 'El reporte tiene demasiadas filas para un PDF. Elige un periodo más corto.',
    });
    await expect(page.getByRole('row', { name: /C-100BTX/ })).toBeVisible();

    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    await expect(page.getByText('Elige un periodo más corto.')).toBeVisible();
  });

  test('fits the screen and has a single primary button', async ({ page, baseURL }) => {
    await open(page, baseURL, `${REPORTS}/buses`, seed);
    await expect(page.getByRole('row', { name: /C-100BTX/ })).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expect(page.locator('button.bg-primary')).toHaveCount(1);
  });

  test('is reached from the menu and from the index of reports', async ({ page, baseURL }) => {
    await open(page, baseURL, REPORTS, seed);

    await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page
      .getByRole('main')
      .getByRole('link', { name: /Listado de buses/ })
      .click();

    await expect(page).toHaveURL(/\/sucursal\/reportes\/buses/);
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Listado de buses' }).first()).toBeVisible();
  });
});
