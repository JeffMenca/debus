import { expect, test } from '@playwright/test';
import { mockAdminGateway, sampleBranch, sampleUser } from './support/admin-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const seed = {
  branches: [
    sampleBranch(),
    sampleBranch({
      id: '5d1f3a20-2222-4d4d-9999-123456789abc',
      code: 'FLO',
      name: 'Flores',
      department: 'Petén',
      municipality: 'Flores',
    }),
  ],
  users: [
    sampleUser({ fullName: 'Luis Ramírez', email: 'luis@correo.com', role: 'BRANCH_ADMIN' }),
    sampleUser({ fullName: 'Pedro Gómez', email: 'pedro@correo.com', status: 'PENDING' }),
    sampleUser({ fullName: 'Rosa Pop', email: 'rosa@correo.com', role: 'DRIVER' }),
  ],
};

test.describe('admin users', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('invites a cashier and finds them waiting for their invitation', async ({
    page,
    baseURL,
  }) => {
    const gateway = await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/usuarios');

    await page.getByRole('button', { name: 'Invitar usuario' }).click();
    const dialog = page.getByRole('dialog', { name: 'Invitar usuario' });
    await dialog.getByLabel('Nombre completo').fill('Ana Sic');
    await dialog.getByLabel('Correo').fill('ana.sic@correo.com');
    await dialog.getByRole('combobox', { name: 'Rol' }).click();
    await page.getByRole('option', { name: 'Cajero' }).click();
    await dialog.getByRole('combobox', { name: 'Sucursal' }).click();
    await page.getByRole('option', { name: 'Quetzaltenango' }).click();
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click();

    await expect(
      page.getByText('Le enviamos un correo a ana.sic@correo.com para que cree su contraseña.'),
    ).toBeVisible();
    await page.getByRole('tab', { name: /Invitación enviada/ }).click();
    await expect(page.getByRole('row', { name: /Ana Sic/ })).toContainText('Invitación enviada');
    expect(
      gateway.requests.find((r) => r.method === 'POST' && r.path.endsWith('/users'))?.body,
    ).toMatchObject({ role: 'CASHIER' });
    await expectNoHorizontalScroll(page);
  });

  test('explains why the last admin of a branch cannot be deactivated', async ({
    page,
    baseURL,
  }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/usuarios');

    await page.getByRole('button', { name: 'Acciones de Luis Ramírez' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();

    await expect(page.getByRole('alertdialog')).toContainText(
      'La sucursal debe conservar al menos un administrador.',
    );
  });

  test('deactivates and reactivates a person', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/usuarios');

    await page.getByRole('button', { name: 'Acciones de Rosa Pop' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByRole('row', { name: /Rosa Pop/ })).toContainText('Inactivo');

    await page.getByRole('button', { name: 'Acciones de Rosa Pop' }).click();
    await page.getByRole('menuitem', { name: 'Reactivar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByRole('row', { name: /Rosa Pop/ })).toContainText('Activo');
  });

  test('resends an invitation and tells so', async ({ page, baseURL }) => {
    const gateway = await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/usuarios');

    await page.getByRole('button', { name: 'Acciones de Pedro Gómez' }).click();
    await page.getByRole('menuitem', { name: 'Reenviar invitación' }).click();

    await expect(
      page.getByText('Enviamos de nuevo la invitación a pedro@correo.com.'),
    ).toBeVisible();
    expect(gateway.requests.some((r) => r.path.endsWith('/invitation'))).toBe(true);
  });

  test('is reached from the sidebar and filters by search', async ({ page, baseURL }) => {
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin');

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/usuarios$/);

    await page.getByRole('textbox', { name: 'Buscar usuario' }).fill('rosa');
    await expect(page.getByRole('row', { name: /Rosa Pop/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Pedro Gómez/ })).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('keeps the table scroll inside its card on a phone', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'only meaningful on a phone');
    await mockAdminGateway(page, seed);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/usuarios');

    await expect(page.getByRole('table', { name: 'Usuarios' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
