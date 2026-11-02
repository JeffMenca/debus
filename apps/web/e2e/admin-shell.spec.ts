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

  test('the logo folds with the sidebar and stays clear of its button', async ({
    page,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the sidebar only collapses on a wide screen');
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.route('**/api/system/**', (route) => route.abort());
    await page.goto('/admin');
    const sidebar = page.locator('[data-slot="sidebar-container"]');
    const logo = sidebar.getByLabel('debus');
    await expect(sidebar.getByText('debus', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Colapsar menú' }).click();
    const expand = page.getByRole('button', { name: 'Expandir menú' });
    await expect(expand).toBeVisible();
    await expect(sidebar.getByText('debus', { exact: true })).toBeHidden();

    await expect(async () => {
      const box = (await logo.boundingBox())!;
      const button = (await expand.boundingBox())!;
      const bar = (await sidebar.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bar.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bar.x + bar.width);
      const apart =
        box.x + box.width <= button.x ||
        button.x + button.width <= box.x ||
        box.y + box.height <= button.y ||
        button.y + button.height <= box.y;
      expect(apart).toBe(true);
    }).toPass();
  });

  test('the phone menu shows the logo with its name', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the phone menu only exists on a narrow screen');
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.route('**/api/system/**', (route) => route.abort());
    await page.goto('/admin');

    await page.getByRole('button', { name: 'Abrir menú' }).click();

    await expect(page.getByRole('dialog').getByText('debus', { exact: true })).toBeVisible();
  });

  test('people without the role are sent to their own start page', async ({ page, baseURL }) => {
    await signInAs(page, baseURL!, 'CASHIER', '9b2c7a10-1111-4c4c-8888-123456789abc');
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/sucursal$/);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible();
  });
});
