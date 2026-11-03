import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { type Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
import { queryLocal } from './support/local-sql';
import { isReachable, mailpitUrl, waitForMail } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import { signInClientPage, signUpClient } from './support/real-client';
import { ACTION_TIMEOUT, createBranch, signInAsBranchAdmin } from './support/real-fleet';

const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:4000';

// Waits until a query of a local database finds the row, which events may still be carrying.
async function untilFound(service: string, sql: string, what: string): Promise<string> {
  await expect
    .poll(() => queryLocal(service, sql).length, { timeout: ACTION_TIMEOUT, message: what })
    .toBeGreaterThan(0);
  return queryLocal(service, sql)[0]!;
}

async function fillTrip(page: Page, trip: { destination: string; day: string; km: string }) {
  await page.getByLabel('Salen de').fill('Quetzaltenango');
  await page.getByLabel('Van a').fill(trip.destination);
  await page.getByLabel('Día de salida').fill(trip.day);
  await page.getByLabel('Pasajeros').fill('30');
  await page.getByLabel('Distancia aproximada (km)').fill(trip.km);
}

async function rowAction(page: Page, client: string, action: string) {
  await page.getByRole('button', { name: `Acciones de ${client}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
}

test.describe('private rentals on a real stack', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates accounts, branches and rentals: runs only on the local stack',
  );
  test.setTimeout(480_000);
  test.use({ actionTimeout: ACTION_TIMEOUT, navigationTimeout: ACTION_TIMEOUT });
  test.afterAll(() => cleanUpTestRun());

  test('a client asks, the branch prices, the wallet pays and the rental waits for its bus; a counter one is paid from the wallet and refunded when cancelled', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const branchName = `${TEST_BRANCH_PREFIX}${TEST_RUN} alquileres ${stamp}`;
    const branchAdmin = testEmail(`rental-admin-${testInfo.project.name}`);
    const clientEmail = testEmail(`rental-client-${testInfo.project.name}`);
    const clientName = `Familia ${stamp}`;
    const day = guatemalaAgo(-3 * 24 * 60).day;
    const api = await playwrightRequest.newContext({ baseURL: GATEWAY });

    // The client signs up and tops up Q 3,000.
    const client = await signUpClient(api, inbox!, clientEmail, clientName);
    await untilFound(
      'clientes',
      `SELECT user_id FROM client_profiles WHERE user_id = '${client.clientId}'`,
      'the profile of the client',
    );
    const topUp = await api.post('/api/clientes/wallet/top-ups', {
      headers: { ...client.headers, 'idempotency-key': randomUUID() },
      data: { amount: 3000, paidOn: guatemalaAgo(0).day },
    });
    expect(topUp.status()).toBe(201);
    const balance = async () =>
      (
        (await (await api.get('/api/clientes/wallet', { headers: client.headers })).json()) as {
          balance: number;
        }
      ).balance;

    // A test branch with its admin.
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, branchName, branchAdmin);
    const { page: branch, context: branchContext } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );

    // The client asks for a bus from that branch.
    const { page: buyer, context: buyerContext } = await signInClientPage(
      browser,
      baseURL!,
      clientEmail,
    );
    await buyer.goto('/alquiler');
    await buyer.getByLabel('Sucursal que te atiende').click();
    await buyer.getByRole('option', { name: new RegExp(stamp) }).click();
    await fillTrip(buyer, { destination: 'Panajachel', day, km: '92' });
    await expect(buyer.getByText(/por km/)).toBeVisible();
    await buyer.getByRole('button', { name: 'Pedir cotización' }).click();
    await expect(buyer.getByText('Esperando precio')).toBeVisible();
    const rentalId = await untilFound(
      'clientes',
      `SELECT id FROM rentals WHERE client_id = '${client.clientId}'`,
      'the online rental',
    );

    // The branch confirms another price; the client hears it by email.
    await branch.goto('/sucursal/alquileres');
    await rowAction(branch, clientName, 'Confirmar precio');
    const confirm = branch.getByRole('dialog');
    await confirm.getByLabel('Precio').fill('2500');
    await confirm.getByRole('button', { name: 'Confirmar precio' }).click();
    await expect(confirm).toBeHidden();
    await waitForMail(inbox!, clientEmail, /Tu cotización está lista/);

    // The client pays from the wallet on the chosen day.
    await buyer.goto('/cuenta?pestana=alquileres');
    await expect(buyer.getByText('Precio listo, falta pagar')).toBeVisible();
    await buyer.getByRole('button', { name: 'Pagar', exact: true }).click();
    await buyer.getByRole('dialog').getByLabel('Fecha de pago').fill(guatemalaAgo(0).day);
    await buyer.getByRole('dialog').getByRole('button', { name: 'Pagar con mi cartera' }).click();
    await expect(buyer.getByText('Pagado', { exact: true })).toBeVisible();
    expect(await balance()).toBe(500);
    await waitForMail(inbox!, clientEmail, /Tu alquiler está confirmado/);
    expect(
      await buyer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // viajes has it waiting for a bus and a driver.
    await untilFound(
      'viajes',
      `SELECT id FROM rental_requests WHERE id = '${rentalId}' AND status = 'PENDING'`,
      'the paid rental in viajes',
    );
    await branch.goto('/sucursal/viajes?pestana=alquileres');
    await expect(branch.getByText(clientName)).toBeVisible();

    // The same client agrees another rental at the counter and pays it from the wallet.
    const moreFunds = await api.post('/api/clientes/wallet/top-ups', {
      headers: { ...client.headers, 'idempotency-key': randomUUID() },
      data: { amount: 4000, paidOn: guatemalaAgo(0).day },
    });
    expect(moreFunds.ok()).toBe(true);
    await branch.goto('/sucursal/alquileres/ventanilla');
    for (const [label, department] of [
      ['Salen de', 'Quetzaltenango'],
      ['Van a', 'Quetzaltenango'],
    ] as const) {
      await branch.getByRole('combobox', { name: label }).click();
      await branch.getByRole('option', { name: department, exact: true }).click();
    }
    await branch.getByLabel('Día de salida').fill(guatemalaAgo(-4 * 24 * 60).day);
    await branch.getByLabel('Pasajeros').fill('30');
    await branch.getByLabel('Distancia aproximada (km)').fill('100');
    await branch.getByRole('searchbox', { name: 'Buscar cliente' }).fill(clientEmail);
    await expect(branch.getByRole('combobox', { name: 'Cliente' })).toBeEnabled();
    await expect(async () => {
      await branch.getByRole('combobox', { name: 'Cliente' }).click();
      await expect(branch.getByRole('option')).toHaveCount(1, { timeout: 1_000 });
    }).toPass();
    await branch.getByRole('option', { name: new RegExp(clientName) }).click();
    await expect(branch.getByLabel('Precio acordado')).not.toHaveValue('');
    await branch.getByRole('button', { name: 'Registrar alquiler' }).click();
    await expect(branch).toHaveURL(/estado=esperando-pago/);
    const counterId = await untilFound(
      'clientes',
      `SELECT id FROM rentals WHERE client_id = '${client.clientId}' AND channel = 'COUNTER'`,
      'the counter rental',
    );
    await waitForMail(inbox!, clientEmail, /Tu cotización está lista/);

    // The branch can no longer take cash for it: the client pays.
    await branch.getByRole('button', { name: `Acciones de ${clientName}` }).click();
    await expect(branch.getByRole('menuitem', { name: 'Cancelar alquiler' })).toBeVisible();
    await expect(branch.getByRole('menuitem', { name: 'Registrar pago en efectivo' })).toHaveCount(
      0,
    );
    await branch.keyboard.press('Escape');

    await buyer.goto('/cuenta?pestana=alquileres');
    await buyer.getByRole('button', { name: 'Pagar', exact: true }).click();
    await buyer.getByRole('dialog').getByRole('button', { name: 'Pagar con mi cartera' }).click();
    await expect(buyer.getByRole('dialog')).toBeHidden();
    await untilFound(
      'viajes',
      `SELECT id FROM rental_requests WHERE id = '${counterId}'`,
      'the counter rental in viajes',
    );

    // Cancelled by the branch: its money goes back to the wallet.
    const before = await balance();
    await branch.goto('/sucursal/alquileres?estado=pagados');
    await branch
      .getByRole('row', { name: /En ventanilla/ })
      .getByRole('button', { name: `Acciones de ${clientName}` })
      .click();
    await branch.getByRole('menuitem', { name: 'Cancelar alquiler' }).click();
    const cancel = branch.getByRole('alertdialog');
    await expect(cancel.getByText(/a la cartera del cliente/)).toBeVisible();
    await cancel.getByRole('checkbox').click();
    await cancel.getByRole('button', { name: 'Sí, cancelar alquiler' }).click();
    await expect(cancel).toBeHidden();
    await untilFound(
      'clientes',
      `SELECT id FROM rentals WHERE id = '${counterId}' AND status = 'CANCELLED'`,
      'the cancellation in clientes',
    );
    await expect.poll(balance, { timeout: 30_000 }).toBeGreaterThan(before);

    await buyerContext.close();
    await branchContext.close();
    await api.dispose();
  });
});
