import { type Page, expect, test } from '@playwright/test';
import { todayInGuatemala } from '@debus/contracts';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import { mockExpensesGateway, sampleCategory } from './support/expenses-gateway';
import { FLEET_BRANCH_ID, mockFleetGateway, sampleBus, sampleRoute } from './support/fleet-gateway';
import {
  type ReportsSeed,
  mockReportsGateway,
  sampleBusRow,
  sampleDepreciationRow,
  sampleDriverRow,
  sampleRentalIncomeRow,
  sampleRepairRow,
  sampleTicketIncomeRow,
} from './support/reports-gateway';
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

test.describe('branch report: drivers', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  const seed: ReportsSeed = {
    drivers: [
      sampleDriverRow({ fullName: 'Ana Pérez', completedTrips: 4 }),
      sampleDriverRow({ fullName: 'Luis Gómez', completedTrips: 1 }),
      sampleDriverRow({
        fullName: 'José Núñez',
        active: false,
        completedTrips: 0,
        licenseExpiresOn: '2020-01-15',
      }),
    ],
  };

  test('shows the drivers with the count of each state and filters by one of them', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${REPORTS}/choferes`, seed);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Listado de choferes' }),
    ).toBeVisible();
    await expect(page.getByRole('table', { name: 'Choferes' }).getByRole('row')).toHaveCount(4);
    await expect(page.getByRole('tab', { name: /Todos/ })).toContainText('3');
    await expect(page.getByRole('tab', { name: /Activos/ })).toContainText('2');
    await expect(page.getByRole('row', { name: /José Núñez/ })).toContainText('Venció');

    await page.getByRole('tab', { name: /Inactivos/ }).click();

    await expect(page).toHaveURL(/estado=inactivos/);
    await expect(page.getByRole('table', { name: 'Choferes' }).getByRole('row')).toHaveCount(2);
    expect(lastQuery().get('status')).toBe('inactive');
    expect(lastQuery().get('page')).toBe('1');

    await page.getByRole('tab', { name: /Activos/ }).click();
    await expect.poll(() => lastQuery().get('status')).toBe('active');
    await page.getByRole('tab', { name: /Todos/ }).click();
    await expect.poll(() => lastQuery().get('status')).toBe('all');
    await expectNoHorizontalScroll(page);
  });

  test('reads the search from the address and sends it to the report', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${REPORTS}/choferes?buscar=nunez`, seed);

    await expect(page.getByRole('row', { name: /José Núñez/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Ana Pérez/ })).toHaveCount(0);
    expect(new URLSearchParams(gateway.reports().at(-1)!.query).get('q')).toBe('nunez');
  });

  test('exports the PDF with the filters on screen and names it after the report and the day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${REPORTS}/choferes?estado=activos`, seed);
    await expect(page.getByRole('row', { name: /Ana Pérez/ })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(`reporte-choferes-${todayInGuatemala()}.pdf`);
    const [pdf] = gateway.pdfs();
    expect(new URLSearchParams(pdf!.query).get('status')).toBe('active');
  });

  test('fits the screen and has a single primary button', async ({ page, baseURL }) => {
    await open(page, baseURL, `${REPORTS}/choferes`, seed);
    await expect(page.getByRole('row', { name: /Ana Pérez/ })).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expect(page.locator('button.bg-primary')).toHaveCount(1);
  });

  test('is reached from the index of reports and from the menu', async ({ page, baseURL }) => {
    await open(page, baseURL, REPORTS, seed);

    await page
      .getByRole('main')
      .getByRole('link', { name: /Listado de choferes/ })
      .click();

    await expect(page).toHaveURL(/\/sucursal\/reportes\/choferes/);
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Listado de choferes' }).first()).toBeVisible();
  });
});

test.describe('branch report: depreciation', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  const seed: ReportsSeed = {
    depreciation: [
      sampleDepreciationRow({ plate: 'C482BTX', brand: 'Volvo', accumulated: 400 }),
      sampleDepreciationRow({
        plate: 'P222BBB',
        brand: 'Hino',
        model: 'RK8',
        completedTrips: 0,
        kmTraveled: 0,
        appliedPerKm: null,
        accumulated: 0,
      }),
    ],
  };
  const path = `${REPORTS}/depreciacion`;

  test('starts with every record, proposes today in the picker, applies and clears the period', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, path, seed);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);
    const today = todayInGuatemala();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Depreciación por bus' }),
    ).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Depreciación por bus' }).getByRole('row'),
    ).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Periodo/ })).toContainText(
      'Todos los registros',
    );
    expect(lastQuery().has('from')).toBe(false);
    await expect(page.getByRole('row', { name: /P-222BBB/ })).toContainText('—');
    await expect(page.getByText('Monto por km vigente hoy')).toBeVisible();

    await page.getByRole('button', { name: /Periodo/ }).click();
    await expect(page.getByLabel('Desde')).toHaveValue(today);
    await expect(page.getByLabel('Hasta')).toHaveValue(today);
    await page.getByLabel('Desde').fill('2026-10-01');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page).toHaveURL(new RegExp(`desde=2026-10-01&hasta=${today}`));
    await expect.poll(() => lastQuery().get('from')).toBe('2026-10-01');
    expect(lastQuery().get('to')).toBe(today);
    expect(lastQuery().get('page')).toBe('1');

    await page.getByRole('button', { name: /Periodo/ }).click();
    await page.getByRole('button', { name: 'Ver todos los registros' }).click();

    await expect(page).not.toHaveURL(/desde=/);
    await expect.poll(() => lastQuery().has('from')).toBe(false);
    await expectNoHorizontalScroll(page);
  });

  test('reads the search from the address and sends it to the report', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${path}?buscar=hino`, seed);

    await expect(page.getByRole('row', { name: /P-222BBB/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toHaveCount(0);
    expect(new URLSearchParams(gateway.reports().at(-1)!.query).get('q')).toBe('hino');
  });

  test('says there is no rate when none is configured and explains how the amount is fixed', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, path, { ...seed, currentPerKm: null });

    await expect(page.getByText('Sin configurar')).toBeVisible();
    await expect(page.getByText(/se fija con el monto vigente el día de su llegada/)).toBeVisible();
  });

  test('exports the PDF with the period on screen and names it after the report and the day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${path}?desde=2026-10-01&hasta=2026-10-13`, seed);
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(
      `reporte-depreciacion-${todayInGuatemala()}.pdf`,
    );
    const query = new URLSearchParams(gateway.pdfs()[0]!.query);
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-13');
  });

  test('fits the screen and has a single primary button', async ({ page, baseURL }) => {
    await open(page, baseURL, path, seed);
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expect(page.locator('button.bg-primary')).toHaveCount(1);
  });

  test('is reached from the index of reports and from the menu', async ({ page, baseURL }) => {
    await open(page, baseURL, REPORTS, seed);

    await page
      .getByRole('main')
      .getByRole('link', { name: /Depreciación por bus/ })
      .click();

    await expect(page).toHaveURL(/\/sucursal\/reportes\/depreciacion/);
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Depreciación por bus' }).first()).toBeVisible();
  });
});

test.describe('branch report: repair expenses', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  const volvo = sampleBus({ plate: 'C482BTX' });
  const hino = sampleBus({ plate: 'P222BBB', brand: 'Hino', model: 'RK8' });
  const motor = sampleCategory({ name: 'Motor' });
  const tires = sampleCategory({ name: 'Llantas' });
  const brakes = sampleCategory({ name: 'Frenos' });
  const seed: ReportsSeed = {
    repairs: [
      sampleRepairRow({
        busId: volvo.id,
        categories: [
          { categoryId: motor.id, categoryName: 'Motor', lines: 2, amount: 1500 },
          { categoryId: tires.id, categoryName: 'Llantas', lines: 1, amount: 800 },
        ],
      }),
      sampleRepairRow({
        busId: hino.id,
        plate: 'P222BBB',
        brand: 'Hino',
        model: 'RK8',
        expenses: 1,
        total: 450,
        categories: [{ categoryId: brakes.id, categoryName: 'Frenos', lines: 1, amount: 450 }],
      }),
      sampleRepairRow({
        plate: null,
        brand: null,
        model: null,
        expenses: 1,
        total: 100,
        categories: [{ categoryId: motor.id, categoryName: 'Motor', lines: 1, amount: 100 }],
      }),
    ],
  };
  const path = `${REPORTS}/taller`;

  // The selects of the filters read the buses of flota and the categories of administracion, so
  // those two play too; the admin gateway goes first because the last route registered wins.
  async function openRepairs(page: Page, baseURL: string | undefined, url = path) {
    await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
    await mockFleetGateway(page, { buses: [volvo, hino], drivers: [], routes: [] });
    await mockExpensesGateway(page, { categories: [motor, tires, brakes], buses: [volvo, hino] });
    const gateway = await mockReportsGateway(page, seed);
    await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
    await page.goto(url);
    return gateway;
  }

  test('starts with every record, proposes today in the picker, applies and clears the period', async ({
    page,
    baseURL,
  }) => {
    const gateway = await openRepairs(page, baseURL);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);
    const today = todayInGuatemala();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Gastos de taller por bus' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Periodo/ })).toContainText(
      'Todos los registros',
    );
    expect(lastQuery().has('from')).toBe(false);

    await page.getByRole('button', { name: /Periodo/ }).click();
    await expect(page.getByLabel('Desde')).toHaveValue(today);
    await expect(page.getByLabel('Hasta')).toHaveValue(today);
    await page.getByLabel('Desde').fill('2026-10-01');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page).toHaveURL(new RegExp(`desde=2026-10-01&hasta=${today}`));
    await expect.poll(() => lastQuery().get('from')).toBe('2026-10-01');
    expect(lastQuery().get('to')).toBe(today);
    expect(lastQuery().get('page')).toBe('1');

    await page.getByRole('button', { name: /Periodo/ }).click();
    await page.getByRole('button', { name: 'Ver todos los registros' }).click();
    await expect(page).not.toHaveURL(/desde=/);
    await expect.poll(() => lastQuery().has('from')).toBe(false);
  });

  test('filters by bus and by category, and goes back to the first page', async ({
    page,
    baseURL,
  }) => {
    const gateway = await openRepairs(page, baseURL, `${path}?pagina=2`);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);

    await page.getByRole('combobox', { name: 'Bus' }).click();
    await page.getByRole('option', { name: 'P-222BBB' }).click();
    await expect(page).toHaveURL(new RegExp(`bus=${hino.id}`));
    await expect.poll(() => lastQuery().get('busId')).toBe(hino.id);
    expect(lastQuery().get('page')).toBe('1');
    await expect(page.getByRole('row', { name: /P-222BBB/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Categoría' }).click();
    await page.getByRole('option', { name: 'Frenos' }).click();
    await expect(page).toHaveURL(new RegExp(`categoria=${brakes.id}`));
    await expect.poll(() => lastQuery().get('categoryId')).toBe(brakes.id);

    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page).not.toHaveURL(/bus=|categoria=/);
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();
  });

  test('opens a bus with the keyboard to show its categories', async ({ page, baseURL }) => {
    await openRepairs(page, baseURL);
    const toggle = page.getByRole('button', { name: /C-482BTX/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Subtotal')).toHaveCount(0);

    await toggle.focus();
    await page.keyboard.press('Enter');

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const detail = page.getByRole('region', { name: 'Categorías de C-482BTX' });
    await expect(detail).toContainText('Motor');
    await expect(detail).toContainText('Llantas');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('shows the spending by category and names a bus it knows nothing about', async ({
    page,
    baseURL,
  }) => {
    await openRepairs(page, baseURL);

    await expect(page.getByRole('heading', { name: 'Gasto por categoría' })).toBeVisible();
    await expect(page.getByTestId(`bar-${motor.id}`)).toBeVisible();
    await expect(page.getByRole('row', { name: /Bus sin datos/ })).toBeVisible();
  });

  test('exports the PDF with the filters on screen and names it after the report and the day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await openRepairs(
      page,
      baseURL,
      `${path}?desde=2026-10-01&hasta=2026-10-13&bus=${volvo.id}&categoria=${motor.id}`,
    );
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(`reporte-taller-${todayInGuatemala()}.pdf`);
    const query = new URLSearchParams(gateway.pdfs()[0]!.query);
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-13');
    expect(query.get('busId')).toBe(volvo.id);
    expect(query.get('categoryId')).toBe(motor.id);
  });

  test('fits the screen, without scrolling inside the card, and has a single primary button', async ({
    page,
    baseURL,
  }) => {
    await openRepairs(page, baseURL);
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();

    const card = page.getByRole('table', { name: 'Gastos de taller por bus' }).locator('..');
    const hiddenWidth = () => card.evaluate((el) => el.scrollWidth - el.clientWidth);

    await expectNoHorizontalScroll(page);
    expect(await hiddenWidth()).toBe(0);
    await page.getByRole('button', { name: /C-482BTX/ }).click();
    await expectNoHorizontalScroll(page);
    expect(await hiddenWidth()).toBe(0);
    await expect(page.locator('button.bg-primary')).toHaveCount(1);
  });

  test('is reached from the index of reports and from the menu', async ({ page, baseURL }) => {
    await openRepairs(page, baseURL, REPORTS);

    await page
      .getByRole('main')
      .getByRole('link', { name: /Gastos de taller por bus/ })
      .click();

    await expect(page).toHaveURL(/\/sucursal\/reportes\/taller/);
    await openMenuOnPhone(page);
    await expect(
      page.getByRole('link', { name: 'Gastos de taller por bus' }).first(),
    ).toBeVisible();
  });
});

test.describe('branch report: ticket income', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  const volvo = sampleBus({ plate: 'C482BTX' });
  const hino = sampleBus({ plate: 'P222BBB', brand: 'Hino', model: 'RK8' });
  const guatemala = sampleRoute({ destinationName: 'Guatemala' });
  const antigua = sampleRoute({ destinationName: 'Antigua Guatemala' });
  const seed: ReportsSeed = {
    ticketIncome: [
      sampleTicketIncomeRow({
        routeId: guatemala.id,
        busId: volvo.id,
        departureAt: '2026-10-20T11:30:00.000Z',
        tickets: 3,
        onlineTickets: 2,
        counterTickets: 1,
        income: 255,
      }),
      sampleTicketIncomeRow({
        routeId: antigua.id,
        destinationLabel: 'Antigua Guatemala',
        busId: hino.id,
        busPlate: 'P222BBB',
        departureAt: '2026-10-22T09:00:00.000Z',
        tickets: 3,
        onlineTickets: 3,
        counterTickets: 0,
        income: 300,
      }),
    ],
  };
  const path = `${REPORTS}/ingresos-boletos`;

  // The selects of the filters read the routes and the buses of flota, so it plays too; the admin
  // gateway goes first because the last route registered wins.
  async function openIncome(page: Page, baseURL: string | undefined, url = path) {
    await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
    await mockFleetGateway(page, {
      buses: [volvo, hino],
      drivers: [],
      routes: [guatemala, antigua],
    });
    const gateway = await mockReportsGateway(page, seed);
    await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
    await page.goto(url);
    return gateway;
  }

  test('starts with every record, proposes today in the picker, applies and clears the period', async ({
    page,
    baseURL,
  }) => {
    const gateway = await openIncome(page, baseURL);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);
    const today = todayInGuatemala();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Ingresos por boletos' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Periodo/ })).toContainText(
      'Todos los registros',
    );
    expect(lastQuery().has('from')).toBe(false);

    await page.getByRole('button', { name: /Periodo/ }).click();
    await expect(page.getByLabel('Desde')).toHaveValue(today);
    await expect(page.getByLabel('Hasta')).toHaveValue(today);
    await page.getByLabel('Desde').fill('2026-10-01');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page).toHaveURL(new RegExp(`desde=2026-10-01&hasta=${today}`));
    await expect.poll(() => lastQuery().get('from')).toBe('2026-10-01');
    expect(lastQuery().get('to')).toBe(today);
    expect(lastQuery().get('page')).toBe('1');

    await page.getByRole('button', { name: /Periodo/ }).click();
    await page.getByRole('button', { name: 'Ver todos los registros' }).click();
    await expect(page).not.toHaveURL(/desde=/);
    await expect.poll(() => lastQuery().has('from')).toBe(false);
  });

  test('filters by route and by bus, and goes back to the first page', async ({
    page,
    baseURL,
  }) => {
    const gateway = await openIncome(page, baseURL, `${path}?pagina=2`);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);

    await page.getByRole('combobox', { name: 'Ruta' }).click();
    await page.getByRole('option', { name: 'Quetzaltenango → Antigua Guatemala' }).click();
    await expect(page).toHaveURL(new RegExp(`ruta=${antigua.id}`));
    await expect.poll(() => lastQuery().get('routeId')).toBe(antigua.id);
    expect(lastQuery().get('page')).toBe('1');
    await expect(page.getByRole('row', { name: /P-222BBB/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Bus' }).click();
    await page.getByRole('option', { name: 'P-222BBB' }).click();
    await expect(page).toHaveURL(new RegExp(`bus=${hino.id}`));
    await expect.poll(() => lastQuery().get('busId')).toBe(hino.id);

    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page).not.toHaveURL(/ruta=|bus=/);
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();
  });

  test('shows the income of each route and the tickets of each trip by channel', async ({
    page,
    baseURL,
  }) => {
    await openIncome(page, baseURL);

    await expect(page.getByRole('heading', { name: 'Ingresos por ruta' })).toBeVisible();
    await expect(page.getByTestId(`bar-${guatemala.id}`)).toBeVisible();
    await expect(page.getByTestId(`bar-${antigua.id}`)).toBeVisible();
    const row = page.getByRole('row', { name: /C-482BTX/ });
    await expect(row).toContainText('Quetzaltenango → Guatemala');
    await expect(row.getByRole('cell').nth(3)).toHaveText('3');
    await expect(row.getByRole('cell').nth(4)).toHaveText('2');
    await expect(row.getByRole('cell').nth(5)).toHaveText('1');
  });

  test('exports the PDF with the filters on screen and names it after the report and the day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await openIncome(
      page,
      baseURL,
      `${path}?desde=2026-10-01&hasta=2026-10-13&ruta=${guatemala.id}&bus=${volvo.id}`,
    );
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(
      `reporte-ingresos-boletos-${todayInGuatemala()}.pdf`,
    );
    const query = new URLSearchParams(gateway.pdfs()[0]!.query);
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-13');
    expect(query.get('routeId')).toBe(guatemala.id);
    expect(query.get('busId')).toBe(volvo.id);
  });

  test('fits the screen and has a single primary button', async ({ page, baseURL }) => {
    await openIncome(page, baseURL);
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expect(page.locator('button.bg-primary')).toHaveCount(1);
  });

  test('is reached from the index of reports and from the menu', async ({ page, baseURL }) => {
    await openIncome(page, baseURL, REPORTS);

    await page
      .getByRole('main')
      .getByRole('link', { name: /Ingresos por boletos/ })
      .click();

    await expect(page).toHaveURL(/\/sucursal\/reportes\/ingresos-boletos/);
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Ingresos por boletos' }).first()).toBeVisible();
  });
});

test.describe('branch report: rental income', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  const seed: ReportsSeed = {
    rentals: [
      sampleRentalIncomeRow({ clientName: 'Colegio San José' }),
      sampleRentalIncomeRow({
        clientName: 'Excursión Los Pérez',
        nit: 'CF',
        destinationLabel: 'Semuc Champey',
        returnAt: null,
        busPlate: null,
        paidOn: '2026-10-18',
        price: 1500,
      }),
    ],
  };
  const path = `${REPORTS}/ingresos-alquileres`;

  test('starts with every record, proposes today in the picker, applies and clears the period', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, path, seed);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);
    const today = todayInGuatemala();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Ingresos por alquiler' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Periodo/ })).toContainText(
      'Todos los registros',
    );
    expect(lastQuery().has('from')).toBe(false);

    await page.getByRole('button', { name: /Periodo/ }).click();
    await expect(page.getByLabel('Desde')).toHaveValue(today);
    await expect(page.getByLabel('Hasta')).toHaveValue(today);
    await page.getByLabel('Desde').fill('2026-10-01');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page).toHaveURL(new RegExp(`desde=2026-10-01&hasta=${today}`));
    await expect.poll(() => lastQuery().get('from')).toBe('2026-10-01');
    expect(lastQuery().get('to')).toBe(today);
    expect(lastQuery().get('page')).toBe('1');

    await page.getByRole('button', { name: /Periodo/ }).click();
    await page.getByRole('button', { name: 'Ver todos los registros' }).click();
    await expect(page).not.toHaveURL(/desde=/);
    await expect.poll(() => lastQuery().has('from')).toBe(false);
  });

  test('searches by client, NIT or destination and goes back to the first page', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, `${path}?pagina=2`, seed);
    const lastQuery = () => new URLSearchParams(gateway.reports().at(-1)!.query);

    await page.getByRole('textbox', { name: 'Buscar' }).fill('semuc');

    await expect(page).toHaveURL(/buscar=semuc/);
    await expect.poll(() => lastQuery().get('q')).toBe('semuc');
    expect(lastQuery().get('page')).toBe('1');
    await expect(page.getByRole('row', { name: /Los Pérez/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /San José/ })).toHaveCount(0);
  });

  test('shows a one-way rental and a rental without a bus yet', async ({ page, baseURL }) => {
    await open(page, baseURL, path, seed);

    const row = page.getByRole('row', { name: /Los Pérez/ });
    await expect(row).toContainText('Solo ida');
    await expect(row).toContainText('Por asignar');
    await expect(page.getByRole('row', { name: /San José/ })).toContainText('C-482BTX');
  });

  test('exports the PDF with the filters on screen and names it after the report and the day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(
      page,
      baseURL,
      `${path}?desde=2026-10-01&hasta=2026-10-31&buscar=colegio`,
      seed,
    );
    await expect(page.getByRole('row', { name: /San José/ })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    expect((await download).suggestedFilename()).toBe(
      `reporte-ingresos-alquileres-${todayInGuatemala()}.pdf`,
    );
    const query = new URLSearchParams(gateway.pdfs()[0]!.query);
    expect(query.get('from')).toBe('2026-10-01');
    expect(query.get('to')).toBe('2026-10-31');
    expect(query.get('q')).toBe('colegio');
  });

  test('fits the screen and has a single primary button', async ({ page, baseURL }) => {
    await open(page, baseURL, path, seed);
    await expect(page.getByRole('row', { name: /San José/ })).toBeVisible();

    await expectNoHorizontalScroll(page);
    await expect(page.locator('button.bg-primary')).toHaveCount(1);
  });

  test('is reached from the index of reports and from the menu', async ({ page, baseURL }) => {
    await open(page, baseURL, REPORTS, seed);

    await page
      .getByRole('main')
      .getByRole('link', { name: /Ingresos por alquiler/ })
      .click();

    await expect(page).toHaveURL(/\/sucursal\/reportes\/ingresos-alquileres/);
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Ingresos por alquiler' }).first()).toBeVisible();
  });
});
