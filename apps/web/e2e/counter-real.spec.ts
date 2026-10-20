import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { expect, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
import { queryLocal } from './support/local-sql';
import { isReachable, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
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

test.describe('real counter sale', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates branches and accounts: runs only on the local stack',
  );
  test.setTimeout(300_000);
  test.use({ actionTimeout: ACTION_TIMEOUT, navigationTimeout: ACTION_TIMEOUT });
  test.afterAll(() => cleanUpTestRun());

  test('a trip scheduled in viajes reaches the counter and its seats are sold in cash', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const branchAdmin = testEmail(`counter-${testInfo.project.name}`);
    const plate = `Z${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));

    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, `${TEST_BRANCH_PREFIX}${TEST_RUN} ventanilla ${stamp}`, branchAdmin);
    await createBranch(
      page,
      `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`,
      testEmail(`counter-dest-${testInfo.project.name}`),
    );
    const { page: branch, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );
    await createRoute(branch, `destino ${stamp}`);
    await registerDriver(branch, {
      name: 'Chofer de Ventanilla',
      email: testEmail(`counter-driver-${testInfo.project.name}`),
      license: `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      salary: '175',
    });
    await registerBus(branch, { plate, driverName: 'Chofer de Ventanilla', mileageKm: '1000' });
    // Leaves within the hour: the copy in ventas, which the clean-up does not reach yet, stops
    // being on sale right after the run.
    const soon = guatemalaAgo(-45);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });

    // TripScheduled reaches ventas by Pub/Sub; the counter shows the trip once it is there.
    const row = branch.getByRole('row', { name: plateTail });
    await expect(async () => {
      await branch.goto('/sucursal/ventanilla');
      await expect(row).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: ACTION_TIMEOUT });
    await expect(row).toContainText('40');
    await row.getByRole('button', { name: /Vender/ }).click();
    await branch.getByRole('button', { name: 'Asiento 3', exact: true }).click();
    await branch.getByRole('button', { name: 'Asiento 4', exact: true }).click();
    await branch.getByLabel(/Nombre/).fill('Ana Méndez');
    await branch.getByRole('button', { name: /Cobrar Q\s?140\.00/ }).click();

    await expect(branch.getByRole('heading', { name: 'Boleto vendido' })).toBeVisible();
    await expect(branch.getByText('03, 04')).toBeVisible();
    await branch.getByRole('button', { name: 'Vender otro boleto' }).click();
    await expect(row).toContainText('38');
    await row.getByRole('button', { name: /Vender/ }).click();
    await expect(branch.getByRole('button', { name: 'Asiento 3, ocupado' })).toBeDisabled();

    // The sale is confirmed and announced for the reports and the email.
    const sold = queryLocal(
      'ventas',
      `SELECT t.status || ' ' || t.nit || ' ' || t.total FROM tickets t
       JOIN trips r ON r.trip_id = t.trip_id WHERE r.bus_plate = '${plate}'`,
    );
    expect(sold).toEqual(['CONFIRMED CF 140.00']);
    // Once published, an outbox row keeps no payload: the read model of reportes shows the one announcement.
    const [ticketId] = queryLocal(
      'ventas',
      `SELECT t.id FROM tickets t JOIN trips r ON r.trip_id = t.trip_id WHERE r.bus_plate = '${plate}'`,
    );
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT count(*) FROM branch_report_ticket_sales WHERE id = '${ticketId}'`,
          ),
        { timeout: ACTION_TIMEOUT },
      )
      .toEqual(['1']);
    await context.close();
  });
});
