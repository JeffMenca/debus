import { expect, test } from '@playwright/test';
import { manyUsers, mockAdminGateway, sampleBranch, sampleUser } from './support/admin-gateway';
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

  test.describe('pagination', () => {
    test('pages 45 people, keeps the page in the address and returns to page 1 when filtering', async ({
      page,
      baseURL,
    }) => {
      await mockAdminGateway(page, { branches: [sampleBranch()], users: manyUsers(45) });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto('/admin/usuarios');

      const table = page.getByRole('table', { name: 'Usuarios' });
      await expect(table.locator('tbody tr')).toHaveCount(20);
      await expect(page.getByText('Página 1 de 3')).toBeVisible();
      await expect(page.getByText('Mostrando 1–20 de 45')).toBeVisible();

      const next = page.getByRole('button', { name: 'Página siguiente' });
      await next.scrollIntoViewIfNeeded();
      await next.click();
      await expect(page).toHaveURL(/pagina=2/);
      await expect(page.getByText('Mostrando 21–40 de 45')).toBeVisible();
      await page.reload();
      await expect(page.getByText('Página 2 de 3')).toBeVisible();

      await page.getByRole('button', { name: 'Última página' }).click();
      await expect(page.getByText('Página 3 de 3')).toBeVisible();
      await expect(table.locator('tbody tr')).toHaveCount(5);
      await expect(page.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();

      await page.getByRole('tab', { name: /Invitación enviada/ }).click();
      await expect(page).not.toHaveURL(/pagina=/);
      await expect(page).toHaveURL(/estado=pendientes/);
      await expectNoHorizontalScroll(page);
    });

    test('keeps the controls reachable and 44 px tall, with the table scrolling inside its card', async ({
      page,
      baseURL,
    }) => {
      await mockAdminGateway(page, { branches: [sampleBranch()], users: manyUsers(45) });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto('/admin/usuarios');

      const bar = page.getByRole('navigation', { name: 'Paginación' });
      await bar.scrollIntoViewIfNeeded();
      for (const name of [
        'Primera página',
        'Página anterior',
        'Página siguiente',
        'Última página',
      ]) {
        const box = await bar.getByRole('button', { name }).boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await expect(bar.getByRole('button', { name })).toBeInViewport();
      }
      await expectNoHorizontalScroll(page);
    });

    test('changes how many rows to show from the first page', async ({
      page,
      baseURL,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'the size selector hides below sm');
      await mockAdminGateway(page, { branches: [sampleBranch()], users: manyUsers(45) });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto('/admin/usuarios?pagina=2');

      await page.getByRole('combobox', { name: 'Filas por página' }).click();
      await page.getByRole('option', { name: '50' }).click();

      await expect(page).toHaveURL(/mostrar=50/);
      await expect(page).not.toHaveURL(/pagina=/);
      await expect(page.getByText('Mostrando 1–45 de 45')).toBeVisible();
      await expect(page.getByText('Página 1 de 1')).toBeVisible();
    });

    test('finds a person without minding accents', async ({ page, baseURL }) => {
      await mockAdminGateway(page, {
        users: [...manyUsers(30), sampleUser({ fullName: 'José Pérez', email: 'jose@correo.com' })],
      });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto('/admin/usuarios');

      await page.getByRole('textbox', { name: 'Buscar usuario' }).fill('jose perez');

      await expect(page).toHaveURL(/buscar=jose/);
      await expect(page.getByRole('table', { name: 'Usuarios' }).locator('tbody tr')).toHaveCount(
        1,
      );
      await expect(page.getByRole('row', { name: /José Pérez/ })).toBeVisible();
    });

    test('says so, in view, when the search finds nobody', async ({ page, baseURL }) => {
      await mockAdminGateway(page, { users: manyUsers(5) });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');

      await page.goto('/admin/usuarios?buscar=nadie-se-llama-asi');

      const message = page.getByText('No hay usuarios con esos filtros.');
      await expect(message).toBeInViewport();
      const { width } = page.viewportSize()!;
      const box = (await message.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    });

    test('goes back to the last page when the one in the address is past the end', async ({
      page,
      baseURL,
    }) => {
      await mockAdminGateway(page, { users: manyUsers(45) });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto('/admin/usuarios?pagina=99');

      await expect(page).toHaveURL(/pagina=3/);
      await expect(page.getByText('Página 3 de 3')).toBeVisible();
    });

    test('keeps the tab numbers of the whole list while moving between pages', async ({
      page,
      baseURL,
    }) => {
      await mockAdminGateway(page, {
        users: [...manyUsers(30), ...manyUsers(15, { status: 'PENDING' })],
      });
      await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
      await page.goto('/admin/usuarios');

      await expect(page.getByRole('tab', { name: /Todos/ })).toContainText('45');
      await expect(page.getByRole('tab', { name: /Invitación enviada/ })).toContainText('15');
      await page.getByRole('button', { name: 'Página siguiente' }).click();
      await expect(page.getByText('Página 2 de 3')).toBeVisible();
      await expect(page.getByRole('tab', { name: /Activos/ })).toContainText('30');
    });
  });
});
