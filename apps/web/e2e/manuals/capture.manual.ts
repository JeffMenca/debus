import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

// Read only: the login is the one form that is ever sent. The rest is filled in and captured before
// it is confirmed, and what a finished action looks like comes from the demo data.
const IMAGES = join(__dirname, '../../../../docs/manuales/img');
const PASSWORD = process.env.MANUAL_PASSWORD ?? '';
const ADMIN_PASSWORD = process.env.MANUAL_ADMIN_PASSWORD ?? PASSWORD;
const ADMIN_EMAIL = process.env.MANUAL_ADMIN_EMAIL ?? '';
const account = (tag: string) => `seed+${tag}@debus.local`;
const PHONE = { width: 390, height: 844 };

test.beforeAll(({ baseURL }) => {
  if (new URL(baseURL!).hostname !== 'localhost') {
    throw new Error('The captures only run against the local stack');
  }
  if (!PASSWORD || !ADMIN_EMAIL) throw new Error('Needs MANUAL_PASSWORD and MANUAL_ADMIN_EMAIL');
});

async function shot(page: Page, group: 'clientes' | 'personal', name: string) {
  mkdirSync(join(IMAGES, group), { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: join(IMAGES, group, `${name}.png`) });
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

const chooseSeat = (page: Page) =>
  page
    .getByRole('button', { name: /^Asiento \d+$/, pressed: false })
    .first()
    .click();

// The first future day with trips of the demo data: the sale opens from the search.
async function searchTrips(page: Page) {
  await open(page, '/viajes');
  await choose(page, 'Origen', 'Ciudad de Guatemala');
  await choose(page, 'Destino', 'Quetzaltenango');
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Fecha de salida').fill(tomorrow);
  await page.getByRole('button', { name: 'Buscar viajes' }).click();
  const first = page.getByRole('list', { name: 'Viajes a la venta' }).getByRole('listitem').first();
  await expect(first).toContainText('Ciudad de Guatemala a Quetzaltenango');
  await page.getByRole('heading', { name: 'Viajes disponibles' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 240));
}

test('clients without a session', async ({ page }) => {
  await open(page, '/');
  await shot(page, 'clientes', 'inicio');

  await open(page, '/registro');
  await page.getByLabel('Nombre completo').fill('Ana Ejemplo');
  await page.getByLabel(/NIT/).fill('1234567');
  await page.getByLabel('DPI').fill('1234567890123');
  await page.getByLabel('Teléfono').fill('55554444');
  await page.getByLabel('Correo').fill('ana.ejemplo@correo.com');
  await page.getByLabel(/Dirección/).fill('3a calle 5-20, zona 1, Quetzaltenango');
  await shot(page, 'clientes', 'registro');

  await open(page, '/login');
  await shot(page, 'clientes', 'login');

  await open(page, '/recuperar');
  await shot(page, 'clientes', 'recuperar');
});

test('clients with a session', async ({ page }) => {
  await signIn(page, account('cliente-1'));

  await open(page, '/viajes');
  await shot(page, 'clientes', 'viajes-busqueda');

  await searchTrips(page);
  await shot(page, 'clientes', 'viajes-resultados');

  await page
    .getByRole('list', { name: 'Viajes a la venta' })
    .getByRole('link', { name: /Elegir asientos/ })
    .first()
    .click();
  await chooseSeat(page);
  await chooseSeat(page);
  await shot(page, 'clientes', 'asientos-pago');

  await open(page, '/cuenta');
  await shot(page, 'clientes', 'cuenta-boletos');
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await page.getByText('Tipo de movimiento').waitFor();
  await shot(page, 'clientes', 'cuenta-movimientos');
  const amount = page.getByRole('textbox', { name: 'Monto' });
  await amount.fill('250');
  await amount.scrollIntoViewIfNeeded();
  await shot(page, 'clientes', 'cuenta-recarga');

  await open(page, '/cuenta');
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('dialog', { name: 'Editar perfil' }).waitFor();
  await shot(page, 'clientes', 'perfil');

  await open(page, '/alquiler');
  await page.getByLabel('Salen de').fill('Quetzaltenango');
  await page.getByLabel('Van a').fill('Panajachel');
  await page.getByLabel('Pasajeros').fill('35');
  await page.getByLabel('Distancia aproximada (km)').fill('92');
  await shot(page, 'clientes', 'alquiler');
});

test('clients on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, '/');
  await shot(page, 'clientes', 'inicio-telefono');

  await signIn(page, account('cliente-1'));
  await searchTrips(page);
  await page
    .getByRole('list', { name: 'Viajes a la venta' })
    .getByRole('link', { name: /Elegir asientos/ })
    .first()
    .click();
  await chooseSeat(page);
  await shot(page, 'clientes', 'asientos-telefono');
});

test('system admin', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  const screens: [string, string][] = [
    ['/admin', 'admin-panel'],
    ['/admin/sucursales', 'admin-sucursales'],
    ['/admin/configuracion', 'admin-configuracion'],
    ['/admin/categorias', 'admin-categorias'],
    ['/admin/reportes/mapa-rutas', 'admin-reporte-mapa'],
    ['/admin/reportes/ingresos', 'admin-reporte-ingresos'],
    ['/admin/reportes/rutas-demandadas', 'admin-reporte-rutas'],
    ['/admin/estado', 'admin-estado'],
  ];
  for (const [path, name] of screens) {
    await open(page, path);
    await shot(page, 'personal', name);
  }

  // Only the demo accounts: a local stack keeps whatever other runs left behind.
  await open(page, '/admin/usuarios');
  await page.getByRole('textbox', { name: 'Buscar usuario' }).fill('seed');
  await expect(page.getByRole('table').getByText('seed+', { exact: false }).first()).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'personal', 'admin-usuarios');

  await page.getByRole('button', { name: /Invitar/ }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Nombre/)
    .fill('Carla Ejemplo');
  await page.getByRole('dialog').getByLabel('Correo').fill('carla.ejemplo@correo.com');
  await shot(page, 'personal', 'admin-invitar');

  await open(page, '/admin/sucursales/nueva');
  await page.getByLabel('Teléfono').fill('79511234');
  const map = page.getByLabel('Mapa para ubicar la sucursal');
  await map.scrollIntoViewIfNeeded();
  // The labels of the map let the touches through to the department below them.
  await map.getByText('Quet', { exact: true }).click({ force: true });
  await shot(page, 'personal', 'admin-sucursal-nueva');
});

test('branch admin', async ({ page }) => {
  await signIn(page, account('admin-gua'));
  const screens: [string, string][] = [
    ['/sucursal', 'sucursal-panel'],
    ['/sucursal/viajes', 'sucursal-viajes'],
    ['/sucursal/alquileres', 'sucursal-alquileres'],
    ['/sucursal/buses', 'sucursal-buses'],
    ['/sucursal/choferes', 'sucursal-choferes'],
    ['/sucursal/rutas', 'sucursal-rutas'],
    ['/sucursal/gastos', 'sucursal-gastos'],
    ['/sucursal/reportes/ingresos-boletos', 'sucursal-reporte-boletos'],
    ['/sucursal/reportes/depreciacion', 'sucursal-reporte-depreciacion'],
  ];
  for (const [path, name] of screens) {
    await open(page, path);
    await shot(page, 'personal', name);
  }
});

test('cashier', async ({ page }) => {
  await signIn(page, account('cajero-gua'));
  await open(page, '/sucursal/ventanilla');
  await shot(page, 'personal', 'cajero-viajes');

  await page
    .getByRole('button', { name: /Vender/ })
    .first()
    .click();
  await chooseSeat(page);
  await shot(page, 'personal', 'cajero-asientos');

  await page.getByLabel('NIT').fill('1234567');
  await page.getByLabel(/Nombre/).fill('Luis Ejemplo');
  await page.getByLabel('NIT').scrollIntoViewIfNeeded();
  await shot(page, 'personal', 'cajero-comprador');
});

test('driver', async ({ page }) => {
  await signIn(page, account('chofer-gua-1'));
  await open(page, '/chofer');
  await shot(page, 'personal', 'chofer-viajes');

  await page.getByRole('table').getByRole('link').first().click();
  await page.waitForURL(/\/chofer\/viajes\//);
  await page.getByLabel('Kilometraje inicial').fill('150000');
  await page.getByLabel('Kilometraje inicial').scrollIntoViewIfNeeded();
  await shot(page, 'personal', 'chofer-viaje');

  await open(page, '/chofer');
  await page.getByRole('tab', { name: 'Completados' }).click();
  await page.getByRole('table').getByRole('link').first().click();
  await page.waitForURL(/\/chofer\/viajes\//);
  await page.getByText('Registrada, no editable').first().waitFor();
  await shot(page, 'personal', 'chofer-viaje-completado');
});
