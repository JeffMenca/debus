import { expect, test } from '@playwright/test';
import { mockAccountGateway } from './support/account-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const BRANCH_ID = '8f9e6679-7425-40de-944b-e07fc1f90ae7';

test.describe('staff profile', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('a driver reaches their profile from the menu and fills in the missing data', async ({
    page,
    baseURL,
  }) => {
    await mockAccountGateway(page, {
      profile: { fullName: 'Julio Pérez', nit: null, dpi: null, phone: null, address: null },
    });
    await signInAs(page, baseURL!, 'DRIVER', BRANCH_ID);
    await page.goto('/perfil');

    await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible();
    await expect(page.getByText('Sin registrar')).toHaveCount(4);
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Editar' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('DPI').fill('2734 51920 0901');
    await dialog.getByLabel('Teléfono').fill('5512-3489');
    await dialog.getByLabel(/NIT/).fill('1234567-k');
    await dialog.getByLabel(/Dirección/).fill('Zona 1, Quetzaltenango');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('1234567-K')).toBeVisible();
    await expect(page.getByText('Sin registrar')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('a branch admin finds Mi perfil in the menu', async ({ page, baseURL }) => {
    await mockAccountGateway(page);
    await signInAs(page, baseURL!, 'BRANCH_ADMIN', BRANCH_ID);
    await page.goto('/perfil');

    await expect(page.getByText('4521837-6')).toBeVisible();
    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
