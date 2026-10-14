import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { expect, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { dayFromToday } from './support/fleet-gateway';
import { isLocalStack } from './support/local-stack';
import { isReachable, latestLink, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import {
  createBranch,
  createRoute,
  randomLetters,
  registerBus,
  registerDriver,
  scheduleTrip,
  signInAsBranchAdmin,
} from './support/real-fleet';

test.describe('real fleet and trips', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates branches and accounts: runs only on the local stack',
  );
  test.setTimeout(300_000);
  // Removes the rows of this run and the photos of its branches from the local bucket.
  test.afterAll(() => cleanUpTestRun());

  test('a branch admin registers a route, a bus and a driver, schedules a trip and sees it', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} origen ${stamp}`;
    const destination = `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`;
    const branchAdmin = testEmail(`fleet-${testInfo.project.name}`);
    const driverEmail = testEmail(`driver-${testInfo.project.name}`);
    const plate = `Z${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const license = `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

    // The system admin creates the two branches.
    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, origin, branchAdmin);
    await createBranch(page, destination, testEmail(`dest-${testInfo.project.name}`));

    const { page: branch, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );

    await createRoute(branch, `destino ${stamp}`);
    await registerDriver(branch, {
      name: 'Chofer de Prueba',
      email: driverEmail,
      license,
      salary: '175',
    });
    const busRow = await registerBus(branch, {
      plate,
      driverName: 'Chofer de Prueba',
      mileageKm: '1000',
    });
    await expect(busRow).toContainText('Chofer de Prueba');
    await expect(busRow.getByRole('img', { name: /Foto del bus/ })).toBeVisible();

    const tomorrow = dayFromToday(1);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: tomorrow,
      time: '05:30',
    });

    await branch.goto(`/sucursal/viajes?desde=${tomorrow}&hasta=${tomorrow}`);
    const tripRow = branch.getByRole('row', { name: new RegExp(plate.slice(-3)) });
    await expect(tripRow).toContainText('05:30');
    await expect(tripRow).toContainText('Chofer de Prueba');
    await expect(tripRow).toContainText('Programado');

    // The panel shows it as an upcoming departure of that day.
    await branch.goto('/sucursal');
    await branch.getByLabel('Día').fill(tomorrow);
    await expect(
      branch.getByRole('table', { name: 'Próximas salidas' }).getByRole('row', {
        name: new RegExp(plate.slice(-3)),
      }),
    ).toBeVisible();

    // The driver received the email to create a password (the account follows from DriverAdded).
    expect(await latestLink(inbox!, driverEmail, '/crear-contrasena')).toContain('token=');
    await context.close();
  });
});
