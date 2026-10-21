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
  deleteScheduledTrip,
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

test.describe('a deleted trip refunds its wallet tickets on a real stack', () => {
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

  test('the branch deletes a trip with an online and a counter sale, and the client gets the money back in the wallet', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} cancelado ${stamp}`;
    const branchAdmin = testEmail(`refund-${testInfo.project.name}`);
    const clientEmail = testEmail(`refund-buyer-${testInfo.project.name}`);
    const plate = `V${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));
    const api = await playwrightRequest.newContext({ baseURL: GATEWAY });
    const today = guatemalaAgo(0).day;

    // The client signs up and tops up Q 100.
    const client = await signUpClient(api, inbox!, clientEmail, `${origin} Compradora`);
    await untilInVentas(
      `SELECT 1 FROM client_nits WHERE client_id = '${client.clientId}'`,
      'the copy of the client',
    );
    const topUp = await api.post('/api/clientes/wallet/top-ups', {
      headers: { ...client.headers, 'idempotency-key': randomUUID() },
      data: { amount: 100, paidOn: today },
    });
    expect(topUp.status()).toBe(201);
    const balance = async () =>
      (
        (await (await api.get('/api/clientes/wallet', { headers: client.headers })).json()) as {
          balance: number;
        }
      ).balance;

    // A test branch schedules a trip of Q 85 that leaves within the hour.
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, origin, branchAdmin);
    await createBranch(
      page,
      `${TEST_BRANCH_PREFIX}${TEST_RUN} regreso ${stamp}`,
      testEmail(`refund-dest-${testInfo.project.name}`),
    );
    const { page: branch, context: branchContext } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );
    await createRoute(branch, `regreso ${stamp}`, '214.3', '85');
    await registerDriver(branch, {
      name: 'Chofer Cancelado',
      email: testEmail(`refund-driver-${testInfo.project.name}`),
      license: `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      salary: '175',
    });
    await registerBus(branch, { plate, driverName: 'Chofer Cancelado', mileageKm: '1000' });
    const soon = guatemalaAgo(-45);
    await scheduleTrip(branch, {
      destination: `regreso ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });
    await untilInVentas(`SELECT 1 FROM trips WHERE bus_plate = '${plate}'`, 'the copy of the trip');
    const [tripId] = queryLocal('ventas', `SELECT trip_id FROM trips WHERE bus_plate = '${plate}'`);

    // The client pays seat 5 with the wallet and the counter sells seat 6 in cash.
    const ticketId = randomUUID();
    const bought = await api.post('/api/ventas/purchases', {
      headers: { ...client.headers, 'idempotency-key': ticketId },
      data: { tripId, seats: [5], paidOn: today },
    });
    expect(bought.status()).toBe(201);
    expect(await balance()).toBe(15);
    await branch.goto('/sucursal/ventanilla');
    await branch
      .getByRole('row', { name: plateTail })
      .getByRole('button', { name: /Vender/ })
      .click();
    await branch.getByRole('button', { name: 'Asiento 6', exact: true }).click();
    await branch.getByRole('button', { name: /Cobrar Q\s?85\.00/ }).click();
    await expect(branch.getByRole('heading', { name: 'Boleto vendido' })).toBeVisible();

    // The branch deletes the trip; TripDeleted and RefundRequested do the rest.
    await deleteScheduledTrip(branch, soon.day, plateTail);
    await expect.poll(balance, { timeout: ACTION_TIMEOUT }).toBe(100);
    const refunds = await api.get('/api/clientes/wallet/movements?kind=REFUND', {
      headers: client.headers,
    });
    expect(((await refunds.json()) as { items: unknown[] }).items).toEqual([
      expect.objectContaining({ kind: 'REFUND', amount: 85, reference: ticketId }),
    ]);
    expect(queryLocal('ventas', `SELECT 1 FROM tickets WHERE trip_id = '${tripId}'`)).toEqual([]);
    expect(
      queryLocal(
        'ventas',
        `SELECT status || ' ' || failure FROM purchases WHERE id = '${ticketId}'`,
      ),
    ).toEqual(['FAILED TRIP_CANCELLED']);

    // The purchase answers what happened, and the account shows the refund among the movements.
    const purchase = await api.get(`/api/ventas/purchases/${ticketId}`, {
      headers: client.headers,
    });
    expect(await purchase.json()).toMatchObject({
      status: 'FAILED',
      message: 'Este viaje se canceló. Si ya se te había cobrado, el dinero vuelve a tu cartera.',
    });
    const { page: buyer, context: buyerContext } = await signInClientPage(
      browser,
      baseURL!,
      clientEmail,
    );
    await buyer.goto('/cuenta?pestana=movimientos');
    await expect(buyer.getByText(/^Devolución: Boleto .*asiento 5$/)).toBeVisible();
    await expect(buyer.getByText(/Q\s?100\.00/).first()).toBeVisible();
    expect(
      await buyer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await buyerContext.close();
    await branchContext.close();
    await api.dispose();
  });
});
