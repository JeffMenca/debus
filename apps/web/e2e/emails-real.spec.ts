import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
import { queryLocal } from './support/local-sql';
import {
  deleteMailOf,
  flushEmails,
  isReachable,
  mailSubjects,
  mailpitUrl,
  runLicenseAlerts,
  waitForMail,
} from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import { signUpClient } from './support/real-client';
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

test.describe('the emails of debus on a real stack', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates accounts, branches and purchases: runs only on the local stack',
  );
  test.setTimeout(480_000);
  test.use({ actionTimeout: ACTION_TIMEOUT, navigationTimeout: ACTION_TIMEOUT });
  test.afterAll(async ({ baseURL }) => {
    cleanUpTestRun();
    const inbox = mailpitUrl(baseURL);
    if (inbox) await deleteMailOf(inbox, `to:"-${TEST_RUN}-"`);
  });

  test('a client hears about the top-up, the ticket, the cancelled trip and the refund; the driver and the branch admin about the licence', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const project = testInfo.project.name;
    const stamp = `${project}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} correos ${stamp}`;
    const branchAdmin = testEmail(`emails-admin-${project}`);
    const clientEmail = testEmail(`emails-buyer-${project}`);
    const driverEmail = testEmail(`emails-driver-${project}`);
    const plate = `C${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));
    const api = await playwrightRequest.newContext({ baseURL: GATEWAY });
    const today = guatemalaAgo(0).day;

    // Top-up: the client gets the amount and the new balance.
    const client = await signUpClient(api, inbox!, clientEmail, `${origin} Cliente`);
    await expect
      .poll(
        () =>
          queryLocal('ventas', `SELECT 1 FROM client_nits WHERE client_id = '${client.clientId}'`)
            .length,
        { timeout: ACTION_TIMEOUT },
      )
      .toBeGreaterThan(0);
    const topUp = await api.post('/api/clientes/wallet/top-ups', {
      headers: { ...client.headers, 'idempotency-key': randomUUID() },
      data: { amount: 100, paidOn: today },
    });
    expect(topUp.status()).toBe(201);
    const recharge = await waitForMail(inbox!, clientEmail, /^Recargaste Q\s?100\.00 a tu saldo$/);

    // The branch registers a driver whose licence expires in 10 days: the driver and the branch
    // admin get the 15 day alert, with the days really left.
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, origin, branchAdmin);
    await createBranch(
      page,
      `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`,
      testEmail(`emails-dest-${project}`),
    );
    const { page: branch, context: branchContext } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );
    await createRoute(branch, `destino ${stamp}`, '214.3', '85');
    await registerDriver(branch, {
      name: 'Chofer Correos',
      email: driverEmail,
      license: `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      salary: '175',
      licenseDays: 10,
    });
    await waitForMail(inbox!, driverEmail, /^Tu licencia vence en 10 días$/);
    await waitForMail(inbox!, branchAdmin, /^La licencia de Chofer Correos vence en 10 días$/);
    // The daily job the same day sends nothing new.
    await runLicenseAlerts();
    await flushEmails();
    expect(await mailSubjects(inbox!, driverEmail)).toEqual(['Tu licencia vence en 10 días']);

    // A trip, a ticket paid with the wallet and its confirmation.
    await registerBus(branch, { plate, driverName: 'Chofer Correos', mileageKm: '1000' });
    const soon = guatemalaAgo(-45);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });
    await expect
      .poll(() => queryLocal('ventas', `SELECT trip_id FROM trips WHERE bus_plate = '${plate}'`), {
        timeout: ACTION_TIMEOUT,
      })
      .toHaveLength(1);
    const [tripId] = queryLocal('ventas', `SELECT trip_id FROM trips WHERE bus_plate = '${plate}'`);
    const bought = await api.post('/api/ventas/purchases', {
      headers: { ...client.headers, 'idempotency-key': randomUUID() },
      data: { tripId, seats: [5], paidOn: today },
    });
    expect(bought.status()).toBe(201);
    const ticket = await waitForMail(inbox!, clientEmail, /^Tu boleto para /);

    // The branch deletes the trip: the client is told, and told again when the money is back.
    await deleteScheduledTrip(branch, soon.day, plateTail);
    await waitForMail(inbox!, clientEmail, /^Se canceló tu viaje a /);
    await waitForMail(inbox!, clientEmail, /^Te devolvimos Q\s?85\.00 a tu saldo$/);
    expect(await mailSubjects(inbox!, clientEmail)).toHaveLength(5);

    // The emails read well on this screen: Guatemala time, amounts, and nothing wider than it.
    await page.goto(`${inbox}/view/${ticket.ID}.html`);
    await expect(page.getByText(/Tu lugar: asiento 5\. Total pagado: Q\s?85\.00/)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.goto(`${inbox}/view/${recharge.ID}.html`);
    await expect(page.getByText(/Recibimos tu recarga de Q\s?100\.00/)).toBeVisible();
    await expect(page.getByText(/Tu saldo ahora es de Q\s?100\.00/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`correo-${project}.png`), fullPage: true });

    await branchContext.close();
    await api.dispose();
  });
});
