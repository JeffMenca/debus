import { expect, test } from '@playwright/test';
import {
  SAMPLE_BRANCH_ID,
  mockAdminGateway,
  sampleBranch,
  sampleUser,
} from './support/admin-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const FLORES_ID = '5d1f3a20-2222-4d4d-9999-123456789abc';
const seed = {
  branches: [
    sampleBranch(),
    sampleBranch({
      id: FLORES_ID,
      code: 'FLO',
      name: 'Flores',
      department: 'Petén',
      municipality: 'Flores',
      phone: '79511234',
    }),
    sampleBranch({
      id: '8e2f3a20-3333-4e4e-8888-123456789abc',
      code: 'ESC',
      name: 'Escuintla',
      department: 'Escuintla',
      municipality: 'Escuintla',
      active: false,
    }),
  ],
  users: [
    sampleUser({ fullName: 'Luis Ramírez', email: 'luis@correo.com', role: 'BRANCH_ADMIN' }),
    sampleUser({
      fullName: 'Carla Xol',
      email: 'carla@correo.com',
      role: 'BRANCH_ADMIN',
      branchId: FLORES_ID,
    }),
  ],
};

test.describe('admin branches', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('lists the active branches and the inactive ones on their own tab', async ({
    page,
    baseURL,
  }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales');

    await expect(page.getByRole('row', { name: /Quetzaltenango/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Escuintla/ })).toBeHidden();
    await page.getByRole('tab', { name: /Inactivas/ }).click();
    await expect(page.getByRole('row', { name: /Escuintla/ })).toContainText('Inactiva');
    await expect(page.getByRole('row', { name: /Quetzaltenango/ })).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('deactivating a branch moves it to the inactive tab', async ({ page, baseURL }) => {
    const gateway = await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales');

    await page.getByRole('button', { name: 'Acciones de Flores' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();

    await expect(page.getByText('Desactivamos la sucursal Flores.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Flores/ })).toBeHidden();
    await page.getByRole('tab', { name: /Inactivas/ }).click();
    await expect(page.getByRole('row', { name: /Flores/ })).toBeVisible();
    expect(gateway.requests.some((r) => r.path.endsWith(`/branches/${FLORES_ID}/deactivate`))).toBe(
      true,
    );
  });

  test('explains why a branch without an admin cannot be reactivated', async ({
    page,
    baseURL,
  }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales');

    await page.getByRole('tab', { name: /Inactivas/ }).click();
    await expect(page.getByRole('row', { name: /Escuintla/ })).toContainText('Sin administrador');
    await page.getByRole('button', { name: 'Acciones de Escuintla' }).click();
    await page.getByRole('menuitem', { name: 'Reactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivar' }).click();

    await expect(page.getByRole('alertdialog')).toContainText(
      'Para reactivar la sucursal, primero reactiva o invita a su administrador.',
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('row', { name: /Escuintla/ })).toContainText('Inactiva');
  });

  test('is reached from the sidebar', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin');

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Sucursales', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/sucursales$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sucursales' })).toBeVisible();
  });

  test('keeps the id of the branch for its editor', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales');

    await page.getByRole('button', { name: 'Acciones de Quetzaltenango' }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/sucursales/${SAMPLE_BRANCH_ID}$`));
  });

  test('creates a branch with its location and first admin', async ({ page, baseURL }) => {
    const gateway = await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales');
    await page.getByRole('link', { name: 'Nueva sucursal' }).click();

    await page.getByLabel('Nombre', { exact: true }).fill('Cobán');
    await page.getByLabel('Código').fill('cob');
    await page.getByRole('combobox', { name: 'Departamento' }).click();
    await page.getByRole('option', { name: 'Alta Verapaz' }).click();
    await page.getByLabel('Municipio').fill('Cobán');
    await page.getByLabel('Dirección').fill('1a calle 3-10 zona 1');
    await page.getByLabel('Teléfono').fill('7951-1234');
    const map = page.getByLabel('Mapa para ubicar la sucursal');
    const box = (await map.boundingBox())!;
    await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.getByLabel('Latitud')).not.toHaveValue('');
    await page.getByLabel('Nombre completo').fill('Carla Xol');
    await page.getByLabel('Correo').fill('carla.xol@correo.com');
    await page.getByRole('button', { name: 'Crear sucursal' }).click();

    await expect(page).toHaveURL(/\/admin\/sucursales$/);
    await expect(
      page.getByText('Creamos la sucursal Cobán y enviamos la invitación a carla.xol@correo.com.'),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Cobán/ })).toContainText(
      'Carla Xol (invitación enviada)',
    );
    const body = gateway.requests.find((r) => r.method === 'POST' && r.path.endsWith('/branches'))
      ?.body as { code: string; latitude: number };
    expect(body.code).toBe('COB');
    expect(body.latitude).toBeGreaterThan(13.7);
    await expectNoHorizontalScroll(page);
  });

  test('the map asks no outside server for tiles', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (!isLocal && !request.url().startsWith('data:')) outside.push(request.url());
    });

    await page.goto('/admin/sucursales/nueva');
    await expect(page.getByLabel('Mapa para ubicar la sucursal')).toBeVisible();
    // Leaflet has drawn its panes: by now it would already have asked for tiles.
    await expect(page.locator('.leaflet-map-pane')).toBeAttached();
    await expect(page.locator('.leaflet-tile')).toHaveCount(0);

    expect(outside.filter((url) => /tile|openstreetmap|mapbox/i.test(url))).toEqual([]);
  });

  test('says a point outside Guatemala is not valid', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales/nueva');

    await page.getByLabel('Latitud').fill('19.43');
    await page.getByLabel('Longitud').fill('-99.13');
    await page.getByRole('button', { name: 'Crear sucursal' }).click();

    await expect(page.getByText('Marca la ubicación en el mapa.').first()).toBeVisible();
  });

  test('edits the phone of a branch and shows the new value', async ({ page, baseURL }) => {
    const gateway = await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales');
    await page.getByRole('button', { name: 'Acciones de Flores' }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Flores' })).toBeVisible();
    await page.getByLabel('Teléfono').fill('7951 0000');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText('Guardamos los cambios.')).toBeVisible();
    await expect(page.getByLabel('Teléfono')).toHaveValue('7951-0000');
    expect(
      gateway.requests.find(
        (r) => r.method === 'PATCH' && r.path.endsWith(`/branches/${FLORES_ID}`),
      )?.body,
    ).toEqual({ phone: '79510000' });
  });

  test('refuses a repeated code with the server message', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales/nueva');

    await page.getByLabel('Nombre', { exact: true }).fill('Otra Xela');
    await page.getByLabel('Código').fill('xel');
    await page.getByRole('combobox', { name: 'Departamento' }).click();
    await page.getByRole('option', { name: 'Quetzaltenango' }).click();
    await page.getByLabel('Municipio').fill('Quetzaltenango');
    await page.getByLabel('Dirección').fill('5a calle 1-10 zona 3');
    await page.getByLabel('Teléfono').fill('77612299');
    await page.getByLabel('Latitud').fill('14.8');
    await page.getByLabel('Longitud').fill('-91.5');
    await page.getByLabel('Nombre completo').fill('Pedro Tul');
    await page.getByLabel('Correo').fill('pedro.tul@correo.com');
    await page.getByRole('button', { name: 'Crear sucursal' }).click();

    await expect(page.getByText('Ya existe una sucursal con ese código.')).toBeVisible();
    await expect(page.getByLabel('Código')).toBeFocused();
  });

  test('explains a branch that does not exist', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/sucursales/11111111-2222-4333-8444-555555555555');

    await expect(page.getByText('No encontramos esa sucursal.')).toBeVisible();
    await page.getByRole('link', { name: 'Volver a sucursales' }).click();
    await expect(page).toHaveURL(/\/admin\/sucursales$/);
  });
});
