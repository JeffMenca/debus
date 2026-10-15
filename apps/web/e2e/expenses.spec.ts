import { expect, test, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import {
  type ExpensesSeed,
  mockExpensesGateway,
  sampleCategory,
  sampleExpense,
} from './support/expenses-gateway';
import {
  FLEET_BRANCH_ID,
  dayFromToday,
  mockFleetGateway,
  sampleBus,
} from './support/fleet-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const volvo = sampleBus({ plate: 'C482BTX' });
const scania = sampleBus({ plate: 'C731PLR', brand: 'Scania', model: 'K360' });
const parked = sampleBus({ plate: 'C340RTE', active: false });
const motor = sampleCategory({ name: 'Motor' });
const tires = sampleCategory({ name: 'Llantas' });
const brakes = sampleCategory({ name: 'Frenos', active: false });

type Seed = Omit<ExpensesSeed, 'buses'>;

async function open(
  page: Page,
  baseURL: string | undefined,
  path: string,
  { role = 'BRANCH_ADMIN', ...seed }: Seed & { role?: 'BRANCH_ADMIN' | 'SYSTEM_ADMIN' } = {},
) {
  await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
  await mockFleetGateway(page, { buses: [volvo, scania, parked], drivers: [], routes: [] });
  const gateway = await mockExpensesGateway(page, {
    categories: [motor, tires, brakes],
    buses: [volvo, scania, parked],
    ...seed,
  });
  await signInAs(page, baseURL!, role, role === 'SYSTEM_ADMIN' ? null : FLEET_BRANCH_ID);
  await page.goto(path);
  return gateway;
}

async function chooseOption(
  page: Page,
  scope: ReturnType<Page['locator']>,
  label: string,
  option: string | RegExp,
) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('expense categories', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('the system admin creates a category, deactivates it and finds it among the inactive', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, '/admin/categorias', { role: 'SYSTEM_ADMIN' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Categorías de gasto' }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Motor/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Frenos/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva categoría' });
    await expectNoHorizontalScroll(page);
    await dialog.getByLabel('Nombre').fill('Turbo');
    await dialog.getByRole('button', { name: 'Crear categoría' }).click();

    await expect(page.getByText('Creamos la categoría Turbo.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Turbo/ })).toContainText('Sin gastos');
    expect(gateway.requests.find((r) => r.method === 'POST')?.body).toEqual({ name: 'Turbo' });

    await page.getByRole('button', { name: 'Acciones de Turbo' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByText('Desactivamos la categoría Turbo.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Turbo/ })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Inactivas' }).click();
    await expect(page).toHaveURL(/estado=inactivas/);
    await expect(page.getByRole('row', { name: /Turbo/ })).toContainText('Inactiva');
    await expect(page.getByRole('row', { name: /Frenos/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('row', { name: /Turbo/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a repeated name is refused next to the field, and renaming keeps the rest', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/admin/categorias', { role: 'SYSTEM_ADMIN' });

    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva categoría' });
    await dialog.getByLabel('Nombre').fill('motor');
    await dialog.getByRole('button', { name: 'Crear categoría' }).click();

    await expect(dialog.getByText('Ya existe una categoría con ese nombre.')).toBeVisible();
    await expect(dialog.getByLabel('Nombre')).toBeFocused();
    await dialog.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Acciones de Llantas' }).click();
    await page.getByRole('menuitem', { name: 'Renombrar' }).click();
    const rename = page.getByRole('dialog', { name: 'Renombrar categoría' });
    await expect(rename.getByLabel('Nombre')).toHaveValue('Llantas');
    await rename.getByLabel('Nombre').fill('Llantas y rines');
    await rename.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('row', { name: /Llantas y rines/ })).toBeVisible();
  });

  test('a category with expenses cannot be deleted: the list hides it and the service explains', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/admin/categorias', {
      role: 'SYSTEM_ADMIN',
      expenses: [sampleExpense(volvo, motor), sampleExpense(volvo, tires)],
      // The list the person sees is old: it says Llantas has no expenses, but it has.
      staleUnused: [tires.id],
    });

    await expect(page.getByRole('row', { name: /Motor/ })).toContainText('Con gastos');
    await page.getByRole('button', { name: 'Acciones de Motor' }).click();
    await expect(page.getByRole('menuitem', { name: 'Eliminar' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Acciones de Llantas' }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Eliminar' }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'Esta categoría ya tiene gastos. Desactívala para que no se use más.',
    );
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('row', { name: /Llantas/ })).toBeVisible();
  });

  test('a category without expenses is deleted after a confirmation', async ({ page, baseURL }) => {
    await open(page, baseURL, '/admin/categorias', { role: 'SYSTEM_ADMIN' });

    await page.getByRole('button', { name: 'Acciones de Llantas' }).click();
    await page.getByRole('menuitem', { name: 'Eliminar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();

    await expect(page.getByText('Eliminamos la categoría Llantas.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Llantas/ })).toHaveCount(0);
  });

  test('is reached from the menu of the system admin and keeps search and page in the address', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/admin', { role: 'SYSTEM_ADMIN' });

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Categorías de gasto' }).click();
    await expect(page).toHaveURL(/\/admin\/categorias$/);

    await page.getByRole('textbox', { name: 'Buscar categoría' }).fill('llan');
    await expect(page).toHaveURL(/buscar=llan/);
    await expect(
      page.getByRole('table', { name: 'Categorías de gasto' }).locator('tbody tr'),
    ).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Buscar categoría' })).toHaveValue('llan');
    await expect(page.getByRole('row', { name: /Llantas/ })).toBeVisible();
  });
});

test.describe('repair expenses', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('is reached from the menu and starts empty with an invitation', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/sucursal');

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Gastos de taller', exact: true }).click();

    await expect(page).toHaveURL(/\/sucursal\/gastos$/);
    await expect(page.getByText('Finanzas · Quetzaltenango')).toBeVisible();
    await expect(page.getByText('Aún no hay gastos de taller registrados.')).toBeVisible();
    await expect(page.getByLabel('Desde')).toHaveValue('');
    await expectNoHorizontalScroll(page);
  });

  test('registers an expense with two lines, sees it in the list with its total and filters by category', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, '/sucursal/gastos/nuevo');

    await expect(page.getByLabel('Fecha del servicio')).toHaveValue(dayFromToday(0));
    await chooseOption(page, page.locator('body'), 'Bus', 'C-482BTX');
    const first = page.getByRole('group', { name: 'Línea 1' });
    await chooseOption(page, first, 'Categoría', 'Motor');
    await first.getByLabel('Monto (Q)').fill('1,200.00');
    await first.getByLabel(/Descripción/).fill('Cambio de bomba');
    await page.getByRole('button', { name: 'Agregar línea' }).click();
    const second = page.getByRole('group', { name: 'Línea 2' });
    await chooseOption(page, second, 'Categoría', 'Llantas');
    await chooseOption(page, second, 'Tipo', 'Repuesto');
    await second.getByLabel('Monto (Q)').fill('4000');

    const totals = page.getByRole('status', { name: 'Total del gasto' });
    await expect(totals).toContainText(/Mano de obra\s*Q\s?1,200\.00/);
    await expect(totals).toContainText(/Repuestos\s*Q\s?4,000\.00/);
    await expect(totals).toContainText(/Total\s*Q\s?5,200\.00/);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Guardar gasto' }).click();

    await expect(page).toHaveURL(/\/sucursal\/gastos$/);
    await expect(page.getByText('Gasto registrado.')).toBeVisible();
    const row = page.getByRole('row', { name: /C-482BTX/ });
    await expect(row).toContainText('Motor, Llantas');
    await expect(row).toContainText(/Q\s?5,200\.00/);
    await expect(page.getByText('Total del filtro').locator('..')).toContainText(/Q\s?5,200\.00/);
    expect(gateway.requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      busId: volvo.id,
      serviceDate: dayFromToday(0),
      lines: [
        { kind: 'LABOR', amount: 1200, description: 'Cambio de bomba' },
        { kind: 'PART', amount: 4000 },
      ],
    });

    await row.getByRole('button', { name: /Ver detalle/ }).click();
    const detail = page.getByRole('dialog', { name: /C-482BTX/ });
    await expect(detail).toContainText('Cambio de bomba');
    await detail.getByRole('button', { name: 'Cerrar' }).click();

    await chooseOption(page, page.locator('body'), 'Categoría', 'Frenos');
    await expect(page).toHaveURL(/categoria=/);
    await expect(page.getByText('No hay gastos con esos filtros.')).toBeVisible();
    await chooseOption(page, page.locator('body'), 'Categoría', 'Llantas');
    await expect(row).toBeVisible();
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Categoría' })).toContainText('Llantas');
    await expect(page.getByRole('row', { name: /C-482BTX/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('says what is missing, focuses the first field and sends nothing', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, '/sucursal/gastos/nuevo');

    await page.getByRole('button', { name: 'Guardar gasto' }).click();

    await expect(page.getByText('Elige el bus.')).toBeVisible();
    await expect(page.getByText('Elige la categoría.')).toBeVisible();
    await expect(page.getByText(/Escribe el monto en quetzales/)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Bus' })).toBeFocused();
    expect(gateway.requests.some((r) => r.method === 'POST')).toBe(false);
    await expectNoHorizontalScroll(page);
  });

  test('says the total is too large, focuses the first amount and sends nothing', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, '/sucursal/gastos/nuevo');
    await chooseOption(page, page.locator('body'), 'Bus', 'C-482BTX');
    const first = page.getByRole('group', { name: 'Línea 1' });
    await chooseOption(page, first, 'Categoría', 'Motor');
    await first.getByLabel('Monto (Q)').fill('600000');
    await page.getByRole('button', { name: 'Agregar línea' }).click();
    const second = page.getByRole('group', { name: 'Línea 2' });
    await chooseOption(page, second, 'Categoría', 'Llantas');
    await second.getByLabel('Monto (Q)').fill('400000.01');

    await page.getByRole('button', { name: 'Guardar gasto' }).click();

    await expect(page.getByText(/El total del gasto no puede pasar de/)).toBeVisible();
    await expect(first.getByLabel('Monto (Q)')).toBeFocused();
    expect(gateway.requests.some((r) => r.method === 'POST')).toBe(false);
    await expectNoHorizontalScroll(page);
  });

  test('a deactivated bus is shown but cannot be chosen', async ({ page, baseURL }) => {
    await open(page, baseURL, '/sucursal/gastos/nuevo');

    await page.getByRole('combobox', { name: 'Bus' }).click();

    await expect(page.getByRole('option', { name: 'C-340RTE (desactivado)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByRole('option', { name: 'C-482BTX' })).toBeEnabled();
  });

  test('pressing save twice records one expense', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL, '/sucursal/gastos/nuevo');

    await chooseOption(page, page.locator('body'), 'Bus', 'C-482BTX');
    const line = page.getByRole('group', { name: 'Línea 1' });
    await chooseOption(page, line, 'Categoría', 'Motor');
    await line.getByLabel('Monto (Q)').fill('350.50');
    await page.getByRole('button', { name: 'Guardar gasto' }).dblclick();

    await expect(page).toHaveURL(/\/sucursal\/gastos$/);
    await expect(
      page.getByRole('table', { name: 'Gastos de taller' }).locator('tbody tr'),
    ).toHaveCount(1);
    const ids = new Set(
      gateway.requests.filter((r) => r.method === 'POST').map((r) => (r.body as { id: string }).id),
    );
    expect(ids.size).toBe(1);
    expect(gateway.expenses).toHaveLength(1);
  });

  test('retrying after the service failed sends the same expense, never two', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, '/sucursal/gastos/nuevo', { failSaves: 1 });

    await chooseOption(page, page.locator('body'), 'Bus', 'C-482BTX');
    const line = page.getByRole('group', { name: 'Línea 1' });
    await chooseOption(page, line, 'Categoría', 'Motor');
    await line.getByLabel('Monto (Q)').fill('99.99');
    await page.getByRole('button', { name: 'Guardar gasto' }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'El servicio no respondió' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sucursal\/gastos\/nuevo$/);
    await page.getByRole('button', { name: 'Guardar gasto' }).click();

    await expect(page).toHaveURL(/\/sucursal\/gastos$/);
    const posts = gateway.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(2);
    expect((posts[0]?.body as { id: string }).id).toBe((posts[1]?.body as { id: string }).id);
    expect(gateway.expenses).toHaveLength(1);
  });

  test('keeps every filter and the page in the address after a reload and totals the whole filter', async ({
    page,
    baseURL,
  }) => {
    const expenses = Array.from({ length: 45 }, (_, index) =>
      sampleExpense(index % 3 === 0 ? scania : volvo, index % 2 === 0 ? motor : tires, {
        serviceDate: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
        total: 100,
        laborTotal: 100,
      }),
    );
    await open(page, baseURL, '/sucursal/gastos', { expenses });

    const table = page.getByRole('table', { name: 'Gastos de taller' });
    await expect(table.locator('tbody tr')).toHaveCount(20);
    await expect(page.getByText('Mostrando 1–20 de 45')).toBeVisible();
    await expect(page.getByText('Total del filtro').locator('..')).toContainText(/Q\s?4,500\.00/);
    const next = page.getByRole('button', { name: 'Página siguiente' });
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(page).toHaveURL(/pagina=2/);
    await page.reload();
    await expect(page.getByText('Mostrando 21–40 de 45')).toBeVisible();

    await chooseOption(page, page.locator('body'), 'Bus', 'C-731PLR');
    await expect(page).toHaveURL(/bus=/);
    await expect(page).not.toHaveURL(/pagina=/);
    await page.getByLabel('Desde').fill('2026-09-10');
    await expect(page).toHaveURL(/desde=2026-09-10/);
    await page.getByLabel('Hasta').fill('2026-09-20');
    await expect(page).toHaveURL(/hasta=2026-09-20/);
    await page.getByRole('textbox', { name: 'Buscar gasto' }).fill('bomba');
    await expect(page).toHaveURL(/buscar=bomba/);
    const rows = await table.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Bus' })).toContainText('C-731PLR');
    await expect(page.getByLabel('Desde')).toHaveValue('2026-09-10');
    await expect(page.getByLabel('Hasta')).toHaveValue('2026-09-20');
    await expect(page.getByRole('textbox', { name: 'Buscar gasto' })).toHaveValue('bomba');
    await expect(table.locator('tbody tr')).toHaveCount(rows);
    await expectNoHorizontalScroll(page);
  });

  test('keeps the table scroll inside its card on a phone', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'only meaningful on a phone');
    await open(page, baseURL, '/sucursal/gastos', { expenses: [sampleExpense(volvo, motor)] });

    await expect(page.getByRole('table', { name: 'Gastos de taller' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
