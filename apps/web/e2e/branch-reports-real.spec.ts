import { readFileSync } from 'node:fs';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { type Page, expect, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
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

const CHECK = 'Revisé los datos: no se podrán cambiar';

async function recordDeparture(branch: Page, plateTail: RegExp, day: string) {
  await branch.goto(`/sucursal/viajes?desde=${day}&hasta=${day}`);
  const trip = branch.getByRole('row', { name: plateTail });
  await expect(trip).toHaveCount(1, { timeout: ACTION_TIMEOUT });
  await trip.getByRole('link').click();
  await expect(branch).toHaveURL(/\/sucursal\/viajes\/[0-9a-f-]{36}$/);
  const departure = guatemalaAgo(30);
  await branch.getByLabel('Fecha', { exact: true }).fill(departure.day);
  await branch.getByLabel('Hora', { exact: true }).fill(departure.time);
  await branch.getByRole('button', { name: 'Registrar salida' }).click();
  const dialog = branch.getByRole('alertdialog');
  await dialog.getByRole('checkbox', { name: CHECK }).click();
  await dialog.getByRole('button', { name: 'Sí, registrar salida' }).click();
  await expect(dialog).toBeHidden();
  await expect(branch.getByText('Registrada, no editable')).toBeVisible();
}

test.describe('real branch report: buses', () => {
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
  // Removes the rows of this run from every local database, the read models of reportes included.
  test.afterAll(() => cleanUpTestRun());

  test('a bus that left shows on the road with its driver, and the PDF downloads', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} origen ${stamp}`;
    const destination = `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`;
    const branchAdmin = testEmail(`report-${testInfo.project.name}`);
    const plate = `Z${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));
    const license = `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, origin, branchAdmin);
    await createBranch(page, destination, testEmail(`report-dest-${testInfo.project.name}`));
    const { page: branch, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );

    await createRoute(branch, `destino ${stamp}`);
    await registerDriver(branch, {
      name: 'Chofer de Reporte',
      email: testEmail(`report-driver-${testInfo.project.name}`),
      license,
      salary: '175',
    });
    await registerBus(branch, { plate, driverName: 'Chofer de Reporte', mileageKm: '1000' });
    const soon = guatemalaAgo(-15);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });
    await recordDeparture(branch, plateTail, soon.day);

    // The events take a moment to reach reportes: the report is asked again until the bus is there.
    await expect(async () => {
      await branch.goto('/sucursal/reportes/buses');
      const row = branch.getByRole('row', { name: plateTail });
      await expect(row).toContainText('En ruta');
      await expect(row).toContainText('Chofer de Reporte');
    }).toPass({ timeout: 90_000, intervals: [3_000] });

    await branch.getByRole('tab', { name: /En ruta/ }).click();
    await expect(branch).toHaveURL(/estado=en-ruta/);
    await expect(branch.getByRole('row', { name: plateTail })).toBeVisible();

    const download = branch.waitForEvent('download');
    await branch.getByRole('button', { name: 'Exportar PDF' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^reporte-buses-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(
      readFileSync((await file.path())!)
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');

    await context.close();
  });
});
