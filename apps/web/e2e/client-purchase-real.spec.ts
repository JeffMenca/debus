import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
import { queryLocal } from './support/local-sql';
import { isReachable, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import { signInClientPage, signUpClient } from './support/real-client';
import {
  ACTION_TIMEOUT,
  createBranch,
  createRoute,
  randomLetters,
  registerBus,
  registerDriver,
  scheduleTrip,
  signInAsBranchAdmin,
} from './support/real-fleet';

const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:4000';

// Waits for what an event brings to ventas.
async function untilInVentas(sql: string, what: string) {
  await expect
    .poll(() => queryLocal('ventas', sql).length, { timeout: ACTION_TIMEOUT, message: what })
    .toBeGreaterThan(0);
}

test.describe('a client buys on the screens of a real stack', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates accounts, branches and purchases: runs only on the local stack',
  );
  test.setTimeout(420_000);
  test.use({ actionTimeout: ACTION_TIMEOUT, navigationTimeout: ACTION_TIMEOUT });
  test.afterAll(() => cleanUpTestRun());

  test('searches, pays with the wallet, gets the seats back when short, meets a seat sold at the counter and sees that sale linked by NIT', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} salida ${stamp}`;
    const destination = `${TEST_BRANCH_PREFIX}${TEST_RUN} llegada ${stamp}`;
    const branchAdmin = testEmail(`client-buy-${testInfo.project.name}`);
    const clientEmail = testEmail(`client-buyer-${testInfo.project.name}`);
    const plate = `W${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const nit = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
    const api = await playwrightRequest.newContext({ baseURL: GATEWAY });
    const today = guatemalaAgo(0).day;

    // The client signs up, saves a NIT in the profile and tops up Q 200.
    const client = await signUpClient(api, inbox!, clientEmail, `${origin} Compradora`);
    await untilInVentas(
      `SELECT 1 FROM client_nits WHERE client_id = '${client.clientId}'`,
      'the copy of the client',
    );
    const profile = await api.put('/api/clientes/profile', {
      headers: client.headers,
      data: { dpi: '2345678901234', phone: '55550000', nit },
    });
    expect(profile.status()).toBe(200);
    const topUp = await api.post('/api/clientes/wallet/top-ups', {
      headers: { ...client.headers, 'idempotency-key': randomUUID() },
      data: { amount: 200, paidOn: today },
    });
    expect(topUp.status()).toBe(201);
    await untilInVentas(
      `SELECT 1 FROM client_nits WHERE client_id = '${client.clientId}' AND nit = '${nit}'`,
      'the NIT of the client',
    );

    // A test branch schedules a trip of Q 85 that leaves within the hour.
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, origin, branchAdmin);
    await createBranch(page, destination, testEmail(`client-dest-${testInfo.project.name}`));
    const { page: branch, context: branchContext } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );
    await createRoute(branch, `llegada ${stamp}`, '214.3', '85');
    await registerDriver(branch, {
      name: 'Chofer en Línea',
      email: testEmail(`client-driver-${testInfo.project.name}`),
      license: `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      salary: '175',
    });
    await registerBus(branch, { plate, driverName: 'Chofer en Línea', mileageKm: '1000' });
    const soon = guatemalaAgo(-45);
    await scheduleTrip(branch, {
      destination: `llegada ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });
    await untilInVentas(`SELECT 1 FROM trips WHERE bus_plate = '${plate}'`, 'the copy of the trip');

    // The client finds the trip by origin and destination and pays two seats.
    const { page: buyer, context: buyerContext } = await signInClientPage(
      browser,
      baseURL!,
      clientEmail,
    );
    await buyer.goto(`/viajes?fecha=${soon.day}`);
    await buyer.getByRole('combobox', { name: 'Origen' }).click();
    await buyer.getByRole('option', { name: origin }).click();
    await buyer.getByRole('combobox', { name: 'Destino' }).click();
    await buyer.getByRole('option', { name: destination }).click();
    await buyer.getByRole('button', { name: 'Buscar viajes' }).click();
    const results = buyer.getByRole('list', { name: 'Viajes a la venta' }).getByRole('listitem');
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText('40 de 40 libres');
    await results
      .first()
      .getByRole('link', { name: /Elegir asientos/ })
      .click();
    const seat = (number: number) =>
      buyer.getByRole('button', { name: `Asiento ${number}`, exact: true });
    await seat(9).click();
    await seat(10).click();
    await expect(buyer.getByText(/Q\s?200\.00/)).toBeVisible();
    await buyer.getByRole('button', { name: /^Pagar Q\s?170\.00$/ }).click();
    await expect(
      buyer.getByRole('heading', { name: '¡Listo! Tu boleto está pagado' }),
    ).toBeVisible();

    // With Q 30 left, one more seat is refused and the saga frees it again.
    // The receipt lives on the same address: reloading it opens the seats of the trip again.
    await buyer.reload();
    await seat(11).click();
    await expect(buyer.getByText('Tu saldo no alcanza. Recarga en Mi cuenta.')).toBeVisible();
    await buyer.getByRole('button', { name: /^Pagar/ }).click();
    await expect(buyer.getByRole('alert').filter({ hasText: /saldo/ })).toBeVisible();
    await buyer.reload();
    await expect(seat(11)).toBeEnabled();

    // The counter sells seat 12 with the NIT of the client while the client has it chosen.
    await seat(12).click();
    await branch.goto('/sucursal/ventanilla');
    await branch
      .getByRole('row', { name: new RegExp(plate.slice(-3)) })
      .getByRole('button', { name: /Vender/ })
      .click();
    await branch.getByRole('button', { name: 'Asiento 12', exact: true }).click();
    await branch.getByLabel('NIT').fill(nit);
    await branch.getByRole('button', { name: /Cobrar Q\s?85\.00/ }).click();
    await expect(branch.getByRole('heading', { name: 'Boleto vendido' })).toBeVisible();
    await buyer.getByRole('button', { name: /^Pagar/ }).click();
    await expect(
      buyer.getByRole('alert').filter({
        hasText: 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
      }),
    ).toBeVisible();
    await expect(buyer.getByRole('button', { name: 'Asiento 12, ocupado' })).toBeDisabled();

    // The account lists the online ticket and the counter sale made with the NIT.
    await buyer.goto('/cuenta');
    const tickets = buyer.getByRole('list', { name: 'Tus boletos' });
    await expect(tickets.getByRole('listitem')).toHaveCount(2);
    await expect(tickets).toContainText('Compra en línea');
    await expect(tickets).toContainText('Comprado en ventanilla');
    await expect(buyer.getByRole('region', { name: /Próximo viaje/ })).toBeVisible();
    await expect(buyer.getByText(/Q\s?30\.00/).first()).toBeVisible();

    await buyerContext.close();
    await branchContext.close();
    await api.dispose();
  });
});
