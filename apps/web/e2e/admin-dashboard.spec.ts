import { expect, test } from '@playwright/test';
import { manyUsers, mockAdminGateway, sampleBranch, sampleUser } from './support/admin-gateway';
import { expectNoHorizontalScroll, signInAs } from './support/session';

test.describe('admin dashboard', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('warns when the settings are missing and leads to define them', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await mockAdminGateway(page, {
      branches: [sampleBranch()],
      users: [sampleUser(), sampleUser({ email: 'pedro@correo.com', status: 'PENDING' })],
    });
    await page.goto('/admin');

    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Marta' })).toBeVisible();
    await expect(page.getByText('Falta la configuración')).toBeVisible();
    await expect(page.getByText('Sin definir')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: 'Definir configuración' }).click();

    await expect(page).toHaveURL(/\/admin\/configuracion$/);
  });

  test('shows the counts and no warning once the settings exist', async ({ page, baseURL }) => {
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await mockAdminGateway(page, {
      branches: [sampleBranch()],
      users: [sampleUser()],
      versions: [
        {
          id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          depreciationPerKm: 1.25,
          rentalRatePerKm: 12,
          effectiveFrom: '2020-01-01',
          createdAt: '2020-01-01T10:00:00.000Z',
          createdByName: 'Marta Ruiz',
        },
      ],
    });
    await page.goto('/admin');

    await expect(page.getByText('Sucursal activa', { exact: true })).toBeVisible();
    await expect(page.getByText(/Q\s?1\.25/)).toBeVisible();
    await expect(page.getByText('Falta la configuración')).toBeHidden();
    await expectNoHorizontalScroll(page);
  });

  test('counts 45 people from the summary, asking the server for a single row each time', async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    const gateway = await mockAdminGateway(page, {
      branches: [sampleBranch()],
      users: [...manyUsers(30), ...manyUsers(15, { status: 'PENDING' })],
    });
    await page.goto('/admin');

    await expect(
      page.getByText('Personal activo').locator('xpath=preceding-sibling::*[1]'),
    ).toHaveText('30');
    await expect(
      page.getByText('Invitaciones pendientes').locator('xpath=preceding-sibling::*[1]'),
    ).toHaveText('15');
    const asked = gateway.requests.filter((request) => request.method === 'GET');
    expect(asked.length).toBeGreaterThan(0);
    for (const request of asked) expect(request.query).toContain('pageSize=1');
    await expectNoHorizontalScroll(page);
  });
});
