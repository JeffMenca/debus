import { expect, test, type Page } from '@playwright/test';
import { mockAccountGateway } from './support/account-gateway';
import {
  RENTAL_BRANCH_ID,
  type RentalsSeed,
  mockRentalsGateway,
  sampleRental,
} from './support/rentals-gateway';
import { expectNoHorizontalScroll, signInAs } from './support/session';

async function asClient(page: Page, baseURL: string | undefined, seed: RentalsSeed = {}) {
  await mockAccountGateway(page, { balance: seed.balance ?? 3000 });
  const gateway = await mockRentalsGateway(page, seed);
  await signInAs(page, baseURL!, 'CLIENT');
  return gateway;
}

async function asBranchAdmin(page: Page, baseURL: string | undefined, seed: RentalsSeed = {}) {
  const gateway = await mockRentalsGateway(page, seed);
  await signInAs(page, baseURL!, 'BRANCH_ADMIN', RENTAL_BRANCH_ID);
  return gateway;
}

const primaryButtons = (page: Page) =>
  page.locator('main button.bg-primary:visible, main a.bg-primary:visible');

test.describe('private rentals', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('a client asks for a bus, sees the estimate and finds the request in the history', async ({
    page,
    baseURL,
  }) => {
    await asClient(page, baseURL);
    await page.goto('/alquiler');

    await expect(page.getByRole('heading', { name: 'Alquila un bus', level: 1 })).toBeVisible();
    await expect(page.getByText(/Todavía no has alquilado un bus/)).toBeVisible();
    await expect(primaryButtons(page)).toHaveCount(1);
    await page.getByLabel('Sucursal que te atiende').click();
    await page.getByRole('option', { name: /Xela Centro/ }).click();
    await page.getByLabel('Salen de').fill('Quetzaltenango');
    await page.getByLabel('Van a').fill('Panajachel');
    await page.getByLabel('Día de salida').fill('2030-10-24');
    await page.getByLabel('Pasajeros').fill('35');
    await page.getByLabel('Distancia aproximada (km)').fill('92');
    await expect(page.getByText(/Q\s?2,760\.00/)).toBeVisible();
    await page.getByRole('button', { name: 'Pedir cotización' }).click();

    await expect(page.getByText(/Recibimos tu solicitud/)).toBeVisible();
    await expect(page.getByText('Esperando precio')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('a branch with a very long name fits the form without sideways scroll', async ({
    page,
    baseURL,
  }) => {
    const name = `Sucursal de prueba con un nombre larguísimo ${'Quetzaltenango '.repeat(4)}`;
    await asClient(page, baseURL, { branchName: name });
    await page.goto('/alquiler');

    await page.getByLabel('Sucursal que te atiende').click();
    await page.getByRole('option', { name: /larguísimo/ }).click();

    await expect(page.getByLabel('Sucursal que te atiende')).toContainText('larguísimo');
    await expectNoHorizontalScroll(page);
  });

  test('a client pays the confirmed price from the wallet on the chosen day', async ({
    page,
    baseURL,
  }) => {
    const gateway = await asClient(page, baseURL, {
      rentals: [sampleRental({ status: 'CONFIRMED', price: 2500 })],
    });
    await page.goto('/cuenta?pestana=alquileres');

    await expect(page.getByText('Precio listo, falta pagar')).toBeVisible();
    await page.getByRole('button', { name: 'Pagar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Fecha de pago')).toBeVisible();
    await dialog.getByRole('button', { name: 'Pagar con mi cartera' }).click();

    await expect(page.getByText('Pagado', { exact: true })).toBeVisible();
    expect(gateway.balance()).toBe(500);
    await expectNoHorizontalScroll(page);
  });

  test('the branch admin confirms a price, and the state lives in the address', async ({
    page,
    baseURL,
  }) => {
    await asBranchAdmin(page, baseURL, {
      rentals: [sampleRental({ clientName: 'Colegio San José' })],
    });
    await page.goto('/sucursal/alquileres');

    await expect(page.getByRole('heading', { name: 'Alquileres', level: 1 })).toBeVisible();
    await expect(primaryButtons(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Acciones de Colegio San José' }).click();
    await page.getByRole('menuitem', { name: 'Confirmar precio' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Precio')).toHaveValue('2760');
    await dialog.getByLabel('Precio').fill('2500');
    await dialog.getByRole('button', { name: 'Confirmar precio' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('tab', { name: 'Esperando pago' }).click();
    await expect(page).toHaveURL(/estado=esperando-pago/);
    await expect(page.getByText('Colegio San José', { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('the branch admin records a walk-in rental, takes the cash and cancels it', async ({
    page,
    baseURL,
  }) => {
    await asBranchAdmin(page, baseURL);
    await page.goto('/sucursal/alquileres/ventanilla');

    await page.getByLabel('Salen de').fill('Quetzaltenango');
    await page.getByLabel('Van a').fill('Semuc Champey');
    await page.getByLabel('Día de salida').fill('2030-11-02');
    await page.getByLabel('Pasajeros').fill('20');
    await page.getByLabel('Distancia aproximada (km)').fill('100');
    await page.getByLabel('Nombre del cliente').fill('Excursión Los Pérez');
    await expect(page.getByLabel('Precio acordado')).toHaveValue('3000');
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Registrar alquiler' }).click();

    await expect(page).toHaveURL(/\/sucursal\/alquileres\?estado=esperando-pago/);
    await page.getByRole('button', { name: 'Acciones de Excursión Los Pérez' }).click();
    await page.getByRole('menuitem', { name: 'Registrar pago en efectivo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click();
    await page.getByRole('tab', { name: 'Pagados' }).click();
    await page.getByRole('button', { name: 'Acciones de Excursión Los Pérez' }).click();
    await page.getByRole('menuitem', { name: 'Cancelar alquiler' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText(/en efectivo en la ventanilla/)).toBeVisible();
    await confirm.getByRole('checkbox').click();
    await confirm.getByRole('button', { name: 'Sí, cancelar alquiler' }).click();

    await expect(page.getByText(/Devuelve el efectivo en la ventanilla/)).toBeVisible();
    await expect(page.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(page.getByText('No hay alquileres pagados.')).toBeVisible({ timeout: 10_000 });
  });

  test('a list that fails offers to try again', async ({ page, baseURL }) => {
    await asBranchAdmin(page, baseURL, { failList: true });
    await page.goto('/sucursal/alquileres');

    await expect(page.getByText('No pudimos cargar los alquileres.')).toBeVisible();
  });
});
