import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signInAs } from './support/session';

test.describe('admin shell', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('the system admin moves around with the sidebar', async ({ page, baseURL }, testInfo) => {
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.route('**/api/system/**', (route) => route.abort());
    await page.goto('/admin');
    const mobile = testInfo.project.name === 'mobile';

    if (mobile) {
      await expect(page.getByRole('link', { name: 'Estado del sistema' })).toBeHidden();
      await page.getByRole('button', { name: 'Abrir menú' }).click();
    }
    await page.getByRole('link', { name: 'Estado del sistema' }).click();
    await expect(page).toHaveURL(/\/admin\/estado$/);
    if (mobile) {
      await expect(page.getByRole('link', { name: 'Sucursales' })).toBeHidden();
    } else {
      await page.getByRole('button', { name: 'Colapsar menú' }).click();
      await expect(page.getByRole('button', { name: 'Expandir menú' })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
  });

  test('people without the role are sent to their own start page', async ({ page, baseURL }) => {
    await signInAs(page, baseURL!, 'CASHIER', '9b2c7a10-1111-4c4c-8888-123456789abc');
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/sucursal$/);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
  });
});
