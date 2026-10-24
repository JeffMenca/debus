import { type Page, expect, test } from '@playwright/test';
import { todayInGuatemala } from '@debus/contracts';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';
import {
  BRANCH_ESCUINTLA,
  BRANCH_GUATEMALA,
  BRANCH_QUETZALTENANGO,
  type SystemReportsSeed,
  mockSystemReportsGateway,
  sampleMapBranch,
  sampleMapRoute,
  twoBranchSeed,
} from './support/system-reports-gateway';

const BASE = '/admin/reportes';
const money = (amount: string) => new RegExp(`Q\\s?${amount.replace('.', '\\.')}`);
const isPhone = (page: Page) => (page.viewportSize()?.width ?? Infinity) < 768;

const BRANCHES = [
  sampleBranch({ id: BRANCH_QUETZALTENANGO, code: 'XEL', name: 'Quetzaltenango' }),
  sampleBranch({ id: BRANCH_ESCUINTLA, code: 'ESC', name: 'Escuintla' }),
  sampleBranch({ id: BRANCH_GUATEMALA, code: 'GUA', name: 'Guatemala' }),
];

const mapSeed = (): NonNullable<SystemReportsSeed['map']> => ({
  branches: [
    sampleMapBranch({
      id: BRANCH_ESCUINTLA,
      name: 'Escuintla',
      latitude: 14.3056,
      longitude: -90.7855,
      routes: 1,
    }),
    sampleMapBranch({
      id: BRANCH_GUATEMALA,
      name: 'Guatemala',
      latitude: 14.6349,
      longitude: -90.5069,
      routes: 0,
    }),
    sampleMapBranch({ id: BRANCH_QUETZALTENANGO, name: 'Quetzaltenango', routes: 2 }),
  ],
  routes: {
    [BRANCH_QUETZALTENANGO]: [
      sampleMapRoute({
        destinationName: 'Guatemala',
        distanceKm: 204,
        ticketPrice: 85,
        tickets: 6,
      }),
      sampleMapRoute({
        destinationBranchId: BRANCH_ESCUINTLA,
        destinationName: 'Escuintla',
        latitude: 14.3056,
        longitude: -90.7855,
        distanceKm: 160.5,
        ticketPrice: 70,
        tickets: 1,
      }),
    ],
    [BRANCH_ESCUINTLA]: [
      sampleMapRoute({
        destinationName: 'Guatemala',
        distanceKm: 58,
        ticketPrice: 30,
        tickets: 3,
      }),
    ],
  },
});

async function open(page: Page, baseURL: string | undefined, path: string, seed = {}) {
  await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
  await mockAdminGateway(page, { branches: BRANCHES });
  const gateway = await mockSystemReportsGateway(page, {
    ...twoBranchSeed(),
    map: mapSeed(),
    ...seed,
  });
  await page.goto(`${BASE}/${path}`);
  return gateway;
}

// Every report: where it lives, its title, the table that reports it (none for the map) and the
// name of the file its PDF is saved with.
const REPORTS = [
  {
    path: 'ingresos',
    title: 'Ingresos por sucursal',
    table: 'Ingresos por sucursal',
    stem: 'reporte-ingresos',
    slug: 'system-income',
  },
  {
    path: 'gastos',
    title: 'Gastos por sucursal',
    table: 'Gastos por sucursal',
    stem: 'reporte-gastos',
    slug: 'system-expenses',
  },
  {
    path: 'ganancias',
    title: 'Ganancias',
    table: 'Ganancias por sucursal',
    stem: 'reporte-ganancias',
    slug: 'system-profit',
  },
  {
    path: 'rutas-demandadas',
    title: 'Rutas más demandadas',
    table: 'Rutas más demandadas',
    stem: 'reporte-rutas-demandadas',
    slug: 'system-top-routes',
  },
  {
    path: 'taller',
    title: 'Gastos de taller por categoría',
    table: 'Gastos de taller por categoría',
    stem: 'reporte-taller',
    slug: 'system-repair-expenses',
  },
  {
    path: 'mapa-rutas',
    title: 'Mapa de rutas',
    table: null,
    stem: 'reporte-mapa-rutas',
    slug: 'system-routes-map',
  },
] as const;

const MENU_LINKS = [
  'Ingresos',
  'Gastos',
  'Ganancias',
  'Rutas más demandadas',
  'Taller por categoría',
  'Mapa de rutas',
];

test.describe('system reports', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  for (const report of REPORTS) {
    test.describe(report.path, () => {
      test('loads, fits the screen and has a single primary button', async ({ page, baseURL }) => {
        await open(page, baseURL, report.path);

        await expect(page.getByRole('heading', { level: 1, name: report.title })).toBeVisible();
        if (report.table) {
          await expect(
            page.getByRole('table', { name: report.table }).getByRole('row').nth(1),
          ).toBeVisible();
          await expect(page.getByRole('region', { name: 'Resumen del reporte' })).toBeVisible();
        } else {
          await expect(page.getByRole('region', { name: 'Mapa de Guatemala' })).toBeVisible();
          await expect(page.getByRole('img', { name: /^Sucursal de origen: / })).toBeVisible();
        }

        await expectNoHorizontalScroll(page);
        await expect(page.locator('button.bg-primary')).toHaveCount(1);
      });

      test('exports the PDF with the filters on screen and names it after the report and the day', async ({
        page,
        baseURL,
      }) => {
        const gateway = await open(
          page,
          baseURL,
          report.table
            ? `${report.path}?desde=2026-10-01&hasta=2026-10-23&sucursal=${BRANCH_QUETZALTENANGO}`
            : `${report.path}?sucursal=${BRANCH_ESCUINTLA}`,
        );
        await expect(page.getByRole('heading', { level: 1, name: report.title })).toBeVisible();
        if (report.table) {
          await expect(
            page.getByRole('table', { name: report.table }).getByRole('row').nth(1),
          ).toBeVisible();
        } else {
          await expect(page.getByRole('list', { name: 'Rutas activas' })).toBeVisible();
        }

        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Exportar PDF' }).click();

        expect((await download).suggestedFilename()).toBe(
          `${report.stem}-${todayInGuatemala()}.pdf`,
        );
        const [pdf] = gateway.pdfs();
        const query = new URLSearchParams(pdf!.query);
        expect(pdf!.path).toMatch(new RegExp(`/${report.slug}/pdf$`));
        // The file carries every filtered row, so it never asks for a page.
        expect(query.has('page')).toBe(false);
        expect(query.has('pageSize')).toBe(false);
        if (report.table) {
          expect(query.get('from')).toBe('2026-10-01');
          expect(query.get('to')).toBe('2026-10-23');
          expect(query.get('branchId')).toBe(BRANCH_QUETZALTENANGO);
        } else {
          expect(query.get('branchId')).toBe(BRANCH_ESCUINTLA);
        }
      });
    });
  }

  test('explains with the text of the server when the PDF is too big', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, 'ingresos', {
      pdfRefusal: 'El reporte tiene demasiadas filas para un PDF. Elige un periodo más corto.',
    });
    await expect(page.getByRole('row', { name: 'Total global' })).toBeVisible();

    await page.getByRole('button', { name: 'Exportar PDF' }).click();

    await expect(page.getByText('Elige un periodo más corto.')).toBeVisible();
  });

  test('is reached from the menu with its six reports', async ({ page, baseURL }) => {
    await open(page, baseURL, 'ingresos');
    await openMenuOnPhone(page);

    for (const name of MENU_LINKS) {
      await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
    }
    await page.getByRole('link', { name: 'Mapa de rutas' }).click();

    await expect(page).toHaveURL(/\/admin\/reportes\/mapa-rutas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mapa de rutas' })).toBeVisible();
  });

  test.describe('income', () => {
    test('groups the sales by branch with a subtotal each and a total at the end', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, 'ingresos');
      const table = page.getByRole('table', { name: 'Ingresos por sucursal' });

      // Header, 4 sales, 2 subtotals and the total.
      await expect(table.getByRole('row')).toHaveCount(8);
      await expect(table.getByRole('row', { name: 'Subtotal de Quetzaltenango' })).toContainText(
        money('3,015.00'),
      );
      await expect(table.getByRole('row', { name: 'Subtotal de Escuintla' })).toContainText(
        money('150.00'),
      );
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(
        money('3,165.00'),
      );
      await expect(table.getByRole('row', { name: /Colegio San José/ })).toContainText('Alquiler');
      await expect(table).toContainText('Boleto de ventanilla');
      await expect(page.getByText('Mostrando 1–4 de 4')).toBeVisible();
      const summary = page.getByRole('region', { name: 'Resumen del reporte' });
      await expect(summary).toContainText(money('3,165.00'));
      await expect(page.getByRole('heading', { name: 'Ingresos de cada sucursal' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test('starts with every record and keeps the branch and the period in the address', async ({
      page,
      baseURL,
    }) => {
      const gateway = await open(page, baseURL, 'ingresos');
      const lastQuery = () => gateway.lastQueryOf('system-income');
      const today = todayInGuatemala();

      await expect(page.getByRole('button', { name: /Periodo/ })).toContainText(
        'Todos los registros',
      );
      expect(lastQuery().has('from')).toBe(false);

      await page.getByRole('combobox', { name: 'Sucursal' }).click();
      await page.getByRole('option', { name: 'Escuintla' }).click();
      await expect(page).toHaveURL(new RegExp(`sucursal=${BRANCH_ESCUINTLA}`));
      await expect.poll(() => lastQuery().get('branchId')).toBe(BRANCH_ESCUINTLA);
      expect(lastQuery().get('page')).toBe('1');
      const table = page.getByRole('table', { name: 'Ingresos por sucursal' });
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(money('150.00'));
      await expect(table.getByRole('row', { name: 'Subtotal de Quetzaltenango' })).toHaveCount(0);

      await page.getByRole('button', { name: /Periodo/ }).click();
      await expect(page.getByLabel('Desde')).toHaveValue(today);
      await page.getByLabel('Desde').fill('2026-10-21');
      await page.getByRole('button', { name: 'Aplicar' }).click();
      await expect(page).toHaveURL(new RegExp(`desde=2026-10-21&hasta=${today}`));
      await expect.poll(() => lastQuery().get('from')).toBe('2026-10-21');

      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await expect(page).not.toHaveURL(/desde=|sucursal=/);
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(
        money('3,165.00'),
      );
    });

    test('says what is missing when the period has no sales', async ({ page, baseURL }) => {
      await open(page, baseURL, 'ingresos?desde=2020-01-01&hasta=2020-01-02');

      await expect(page.getByText('Todavía no hay ingresos en este periodo.')).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe('expenses', () => {
    test('groups the spending by branch with a subtotal each and a total at the end', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, 'gastos');
      const table = page.getByRole('table', { name: 'Gastos por sucursal' });

      await expect(table.getByRole('row')).toHaveCount(8);
      await expect(table.getByRole('row', { name: 'Subtotal de Quetzaltenango' })).toContainText(
        money('6,686.00'),
      );
      await expect(table.getByRole('row', { name: 'Subtotal de Escuintla' })).toContainText(
        money('640.00'),
      );
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(
        money('7,326.00'),
      );
      await expect(table).toContainText('Combustible');
      await expect(table).toContainText('Depreciación');
      await expect(table).toContainText('Cuatro llantas nuevas');
      await expectNoHorizontalScroll(page);
    });

    test('narrows to one branch from the address', async ({ page, baseURL }) => {
      const gateway = await open(page, baseURL, `gastos?sucursal=${BRANCH_ESCUINTLA}`);
      const table = page.getByRole('table', { name: 'Gastos por sucursal' });

      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(money('640.00'));
      expect(gateway.lastQueryOf('system-expenses').get('branchId')).toBe(BRANCH_ESCUINTLA);
    });
  });

  test.describe('profit', () => {
    test('shows one row per branch with a total and opens the breakdown of one', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, 'ganancias');
      const table = page.getByRole('table', { name: 'Ganancias por sucursal' });

      await expect(table.getByRole('row')).toHaveCount(4);
      await expect(table.getByRole('row', { name: /Quetzaltenango/ })).toContainText(
        money('3,015.00'),
      );
      await expect(table.getByRole('row', { name: /Quetzaltenango/ })).toContainText(
        money('7,036.50'),
      );
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(
        money('3,165.00'),
      );

      const toggle = page.getByRole('button', { name: /Quetzaltenango/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.focus();
      await page.keyboard.press('Enter');

      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const detail = page.getByRole('region', { name: 'Desglose de Quetzaltenango' });
      for (const label of [
        'Boletos',
        'Alquileres',
        'Combustible',
        'Taller',
        'Repuestos',
        'Depreciación',
      ]) {
        await expect(detail).toContainText(label);
      }
      await expect(detail).toContainText(money('2,760.00'));
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe('top routes', () => {
    test('ranks the routes by tickets and adds them up', async ({ page, baseURL }) => {
      const gateway = await open(page, baseURL, 'rutas-demandadas');
      const table = page.getByRole('table', { name: 'Rutas más demandadas' });

      await expect(table.getByRole('row')).toHaveCount(4);
      await expect(table.getByRole('row').nth(1)).toContainText('Quetzaltenango → Guatemala');
      await expect(table.getByRole('row').nth(2)).toContainText('Escuintla → Guatemala');
      await expect(table.getByRole('row', { name: 'Total' })).toContainText(money('660.00'));
      await expect(table.getByRole('row', { name: 'Total' })).toContainText('9');

      await page.getByRole('combobox', { name: 'Sucursal de origen' }).click();
      await page.getByRole('option', { name: 'Escuintla' }).click();

      await expect(page).toHaveURL(new RegExp(`sucursal=${BRANCH_ESCUINTLA}`));
      await expect
        .poll(() => gateway.lastQueryOf('system-top-routes').get('branchId'))
        .toBe(BRANCH_ESCUINTLA);
      await expect(table.getByRole('row')).toHaveCount(3);
    });
  });

  test.describe('repair expenses by category', () => {
    test('groups the lines by category with a subtotal each and a general total', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, 'taller');
      const table = page.getByRole('table', { name: 'Gastos de taller por categoría' });

      // Header, 3 lines, 2 subtotals and the total.
      await expect(table.getByRole('row')).toHaveCount(7);
      await expect(table.getByRole('row', { name: 'Subtotal de Llantas' })).toContainText(
        money('5,200.00'),
      );
      await expect(table.getByRole('row', { name: 'Subtotal de Cambio de aceite' })).toContainText(
        money('550.50'),
      );
      await expect(table.getByRole('row', { name: 'Total general' })).toContainText(
        money('5,750.50'),
      );
      await expect(page.getByRole('heading', { name: 'Gasto por categoría' })).toBeVisible();
    });

    test('filters by bus, and letting go of the branch lets go of the bus', async ({
      page,
      baseURL,
    }) => {
      const gateway = await open(page, baseURL, 'taller');
      const lastQuery = () => gateway.lastQueryOf('system-repair-expenses');
      const table = page.getByRole('table', { name: 'Gastos de taller por categoría' });

      await page.getByRole('combobox', { name: 'Bus' }).click();
      await page.getByRole('option', { name: /C-482BTX/ }).click();

      await expect(page).toHaveURL(/bus=/);
      await expect.poll(() => lastQuery().get('busId')).not.toBeNull();
      await expect(table.getByRole('row', { name: 'Total general' })).toContainText(
        money('5,550.50'),
      );
      await expect(table.getByRole('row', { name: /P-222BBB/ })).toHaveCount(0);

      await page.getByRole('combobox', { name: 'Sucursal' }).click();
      await page.getByRole('option', { name: 'Escuintla' }).click();

      await expect(page).toHaveURL(new RegExp(`sucursal=${BRANCH_ESCUINTLA}`));
      await expect(page).not.toHaveURL(/bus=/);
      await expect.poll(() => lastQuery().has('busId')).toBe(false);
      await expect(table.getByRole('row', { name: 'Total general' })).toContainText(
        money('200.00'),
      );
    });
  });

  test.describe('routes map', () => {
    test('draws the branch, its destinations and the other branches, and lists the routes', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, `mapa-rutas?sucursal=${BRANCH_QUETZALTENANGO}`);
      const map = page.getByRole('region', { name: 'Mapa de Guatemala' });

      await expect(
        map.getByRole('img', { name: 'Sucursal de origen: Quetzaltenango' }),
      ).toBeVisible();
      await expect(map.getByRole('img', { name: 'Destino con ruta: Guatemala' })).toBeVisible();
      await expect(map.getByRole('img', { name: 'Destino con ruta: Escuintla' })).toBeVisible();
      // Each route is a halo and a dashed line, both in the brand color and not Leaflet's default.
      const lines = map.locator('path.stroke-primary');
      await expect(lines).toHaveCount(4);
      const strokes = await lines.evaluateAll((paths) =>
        paths.map((path) => getComputedStyle(path).stroke),
      );
      expect(strokes).not.toContain('rgb(51, 136, 255)');
      await expect(map.locator('path.route-line')).toHaveCount(2);
      await expect(map.getByText('Bus de ejemplo')).toBeVisible();

      const panel = page.getByRole('region', { name: 'Rutas de la sucursal' });
      await expect(panel).toContainText('Quetzaltenango');
      await expect(panel).toContainText('2 rutas activas');
      const routes = panel.getByRole('list', { name: 'Rutas activas' }).getByRole('listitem');
      await expect(routes).toHaveCount(2);
      await expect(routes.first()).toContainText('Guatemala');
      await expect(routes.first()).toContainText(/204 km/);
      await expect(routes.first()).toContainText('6 boletos vendidos');
      await expect(routes.first()).toContainText(money('85.00'));
      await expect(routes.last()).toContainText('1 boleto vendido');
      await expectNoHorizontalScroll(page);
    });

    test('starts with the first branch that has routes and changes it from the tabs, or the select on a phone', async ({
      page,
      baseURL,
    }) => {
      const gateway = await open(page, baseURL, 'mapa-rutas');
      const map = page.getByRole('region', { name: 'Mapa de Guatemala' });
      await expect(map.getByRole('img', { name: 'Sucursal de origen: Escuintla' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Rutas de la sucursal' })).toContainText(
        '1 ruta activa',
      );
      expect(gateway.lastQueryOf('system-routes-map').has('branchId')).toBe(false);

      if (isPhone(page)) {
        await page.getByRole('combobox', { name: 'Sucursal de origen' }).click();
        await page.getByRole('option', { name: 'Quetzaltenango' }).click();
      } else {
        await page.getByRole('tab', { name: 'Quetzaltenango' }).click();
      }

      await expect(page).toHaveURL(new RegExp(`sucursal=${BRANCH_QUETZALTENANGO}`));
      expect(gateway.lastQueryOf('system-routes-map').get('branchId')).toBe(BRANCH_QUETZALTENANGO);
      await expect(
        map.getByRole('img', { name: 'Sucursal de origen: Quetzaltenango' }),
      ).toBeVisible();
      await expect(map.getByRole('img', { name: 'Sucursal: Escuintla' })).toHaveCount(0);
      await expect(map.getByRole('img', { name: 'Destino con ruta: Escuintla' })).toBeVisible();
      await expect(map.getByRole('img', { name: 'Destino con ruta: Guatemala' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Rutas de la sucursal' })).toContainText(
        '2 rutas activas',
      );
    });

    test('opens a branch without routes with a message instead of an empty map', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, `mapa-rutas?sucursal=${BRANCH_GUATEMALA}`);

      await expect(page.getByText('Esta sucursal aún no tiene rutas activas')).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: 'Mapa de Guatemala' })
          .getByRole('img', { name: 'Sucursal de origen: Guatemala' }),
      ).toBeVisible();
    });

    test('uses a select instead of tabs from five branches', async ({ page, baseURL }) => {
      const extra = ['Cobán', 'Flores'].map((name, index) =>
        sampleMapBranch({ name, latitude: 15.47 + index, longitude: -90.37 - index, routes: 0 }),
      );
      const map = mapSeed();
      await open(page, baseURL, 'mapa-rutas', {
        map: { ...map, branches: [...map.branches, ...extra] },
      });

      await expect(page.getByRole('combobox', { name: 'Sucursal de origen' })).toBeVisible();
      await expect(page.getByRole('tab')).toHaveCount(0);
    });
  });
});
