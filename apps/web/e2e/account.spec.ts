import { expect, test, type Page } from '@playwright/test';
import {
  ACCOUNT_MESSAGES,
  type AccountSeed,
  mockAccountGateway,
  sampleMovement,
} from './support/account-gateway';
import { mockClientTripsGateway } from './support/client-trips-gateway';
import { expectNoHorizontalScroll, signInAs } from './support/session';

async function open(page: Page, baseURL: string | undefined, path: string, seed: AccountSeed = {}) {
  const gateway = await mockAccountGateway(page, seed);
  await mockClientTripsGateway(page, []);
  await signInAs(page, baseURL!, 'CLIENT');
  await page.goto(path);
  return gateway;
}

test.describe('account page', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('a client sees the wallet, the profile and no tickets yet, without sideways scroll', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/cuenta', { balance: 340 });

    await expect(page.getByRole('heading', { name: 'Mis viajes', level: 1 })).toBeVisible();
    await expect(page.getByText(/Q\s?340\.00/).first()).toBeVisible();
    await expect(page.getByText('Ana Méndez')).toBeVisible();
    await expect(page.getByText('4521837-6')).toBeVisible();
    await expect(page.getByText(/Todavía no tienes boletos/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoHorizontalScroll(page);
  });

  test('topping up Q 200 raises the balance once and lists the movement', async ({
    page,
    baseURL,
  }) => {
    const gateway = await open(page, baseURL, '/cuenta', { balance: 340 });

    await page.getByRole('button', { name: /Q\s?200$/ }).click();
    await page.getByRole('button', { name: /Recargar Q\s?200\.00/ }).click();

    await expect(page.getByText(/Recargaste Q\s?200\.00/)).toBeVisible();
    await expect(page.locator('.sr-only', { hasText: /Q\s?540\.00/ })).toHaveCount(1);
    expect(gateway.balance()).toBe(540);
    await page.getByRole('tab', { name: 'Movimientos' }).click();
    await expect(page).toHaveURL(/pestana=movimientos/);
    await expect(page.getByText(/^\+ Q\s?200\.00$/)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('editing the profile saves it and a taken NIT is pointed at', async ({ page, baseURL }) => {
    await open(page, baseURL, '/cuenta', { takenNits: ['99999999'] });

    await page.getByRole('button', { name: 'Editar' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/NIT/).fill('9999999-9');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(dialog.getByText(ACCOUNT_MESSAGES.nitTaken)).toBeVisible();

    await dialog.getByLabel(/NIT/).fill('1234567-k');
    await dialog.getByLabel(/Dirección/).fill('Zona 1, Quetzaltenango');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('1234567-K')).toBeVisible();
    await expect(page.getByText('Zona 1, Quetzaltenango')).toBeVisible();
  });

  test('the movements page and filter live in the address', async ({ page, baseURL }) => {
    const movements = Array.from({ length: 25 }, (_, index) =>
      sampleMovement({
        description: index === 0 ? 'Boleto Quetzaltenango - Guatemala' : `Recarga ${index}`,
        kind: index === 0 ? 'TICKET' : 'TOP_UP',
        amount: index === 0 ? -85 : 10,
      }),
    );
    await open(page, baseURL, '/cuenta?pestana=movimientos', { movements });

    await expect(page.getByText(/Mostrando 1.?20 de 25/)).toBeVisible();
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page).toHaveURL(/pagina=2/);
    await expect(page.getByText('Recarga 24')).toBeVisible();

    await expect(page.getByRole('combobox', { name: 'Tipo de movimiento' })).toHaveText('Todos');
    await page.getByRole('combobox', { name: 'Tipo de movimiento' }).click();
    await page.getByRole('option', { name: 'Boletos' }).click();
    await expect(page).toHaveURL(/tipo=boletos/);
    await expect(page).not.toHaveURL(/pagina=/);
    await expect(page.getByText('Boleto Quetzaltenango - Guatemala')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('staff who open the account page go to their own home', async ({ page, baseURL }) => {
    await mockAccountGateway(page);
    await signInAs(page, baseURL!, 'CASHIER', '8f9e6679-7425-40de-944b-e07fc1f90ae7');
    await page.goto('/cuenta');

    await expect(page).toHaveURL(/\/sucursal$/);
  });
});
