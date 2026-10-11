import { todayInGuatemala } from '@debus/contracts';
import { expect, test } from '@playwright/test';
import { mockAdminGateway } from './support/admin-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

test.describe('admin settings', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('defines the amounts for today and schedules a later change', async ({ page, baseURL }) => {
    const gateway = await mockAdminGateway(page);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/configuracion');

    await expect(page.getByText('Sin definir')).toHaveCount(2);
    await page.getByLabel('Depreciación por kilómetro (Q)').fill('1.25');
    await page.getByLabel('Tarifa de alquiler por kilómetro (Q)').fill('12');
    await page.getByRole('button', { name: 'Guardar cambio' }).click();

    await expect(page.getByText(/Guardamos la configuración\. Rige desde el/)).toBeVisible();
    const history = page.getByRole('table', { name: 'Historial de configuración' });
    await expect(history.getByText('Vigente', { exact: true })).toBeVisible();
    await expect(page.getByText('Sin definir')).toHaveCount(0);
    await expect(page.getByText(/Q\s?1\.25/).first()).toBeVisible();

    await page.getByLabel('Depreciación por kilómetro (Q)').fill('1.5');
    await page.getByLabel('Tarifa de alquiler por kilómetro (Q)').fill('13');
    await page.getByLabel('Vigente desde').fill('2099-01-01');
    await page.getByRole('button', { name: 'Guardar cambio' }).click();

    await expect(page.getByText(/cambia a/)).toBeVisible();
    await expect(history.getByText('Programado', { exact: true })).toBeVisible();
    expect(gateway.requests.filter((r) => r.method === 'POST')).toHaveLength(2);
    await expectNoHorizontalScroll(page);
  });

  test('starts the date on today and refuses the past', async ({ page, baseURL }) => {
    await mockAdminGateway(page);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin/configuracion');

    await expect(page.getByLabel('Vigente desde')).toHaveValue(todayInGuatemala());
    await page.getByLabel('Depreciación por kilómetro (Q)').fill('1.25');
    await page.getByLabel('Tarifa de alquiler por kilómetro (Q)').fill('12');
    await page.getByLabel('Vigente desde').fill('2020-01-01');
    await page.getByRole('button', { name: 'Guardar cambio' }).click();

    await expect(page.getByText('Elige hoy o una fecha posterior.')).toBeVisible();
  });

  test('is reached from the sidebar', async ({ page, baseURL }) => {
    await mockAdminGateway(page);
    await signInAs(page, baseURL!, 'SYSTEM_ADMIN');
    await page.goto('/admin');

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Configuración', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/configuracion$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible();
  });
});
