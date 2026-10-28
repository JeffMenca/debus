import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { type Page, expect, request as playwrightRequest, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { dayFromToday } from './support/fleet-gateway';
import { guatemalaAgo } from './support/guatemala-time';
import { isLocalStack } from './support/local-stack';
import { queryLocal } from './support/local-sql';
import { isReachable, mailpitUrl } from './support/mailpit';
import { signInAsRealAdmin } from './support/real-admin';
import { signInClientPage, signUpClient } from './support/real-client';
import {
  ACTION_TIMEOUT,
  confirmDialog,
  createBranch,
  createRoute,
  deleteScheduledTrip,
  randomLetters,
  registerBus,
  registerDriver,
  scheduleTrip,
  signInAsBranchAdmin,
} from './support/real-fleet';

const CHECK = 'Revisé los datos: no se podrán cambiar';
const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:4000';

// What a person searching on /viajes sees for the trips from one place to another on a day.
async function listedTrips(page: Page, day: string, origin: string, destination: string) {
  await page.goto(`/viajes?fecha=${day}`);
  await page.getByRole('combobox', { name: 'Origen' }).click();
  await page.getByRole('option', { name: origin }).click();
  await page.getByRole('combobox', { name: 'Destino' }).click();
  await page.getByRole('option', { name: destination }).click();
  await page.getByRole('button', { name: 'Buscar viajes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return page.getByRole('list', { name: 'Viajes a la venta' }).getByRole('listitem');
}

test.describe('real trip cycle and repair expenses', () => {
  test.skip(
    !process.env.E2E_REAL_API || !process.env.E2E_ADMIN_EMAIL,
    'runs only against a running stack with an admin',
  );
  test.skip(
    ({ baseURL }) => !isLocalStack(baseURL),
    'creates branches and accounts: runs only on the local stack',
  );
  test.setTimeout(420_000);
  test.use({ actionTimeout: ACTION_TIMEOUT, navigationTimeout: ACTION_TIMEOUT });
  // Removes the rows of this run (including the immutable ones) and the photos of its branches.
  test.afterAll(() => cleanUpTestRun());

  test('a trip leaves and arrives, the other services follow, a trip is deleted and a repair is registered', async ({
    page,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} origen ${stamp}`;
    const destination = `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`;
    const branchAdmin = testEmail(`cycle-${testInfo.project.name}`);
    const plate = `Z${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));
    const license = `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

    await signInAsRealAdmin(page, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(page, origin, branchAdmin);
    await createBranch(page, destination, testEmail(`cycle-dest-${testInfo.project.name}`));
    const { page: branch, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );

    await createRoute(branch, `destino ${stamp}`);
    await registerDriver(branch, {
      name: 'Chofer de Ciclo',
      email: testEmail(`cycle-driver-${testInfo.project.name}`),
      license,
      salary: '175',
    });
    await registerBus(branch, { plate, driverName: 'Chofer de Ciclo', mileageKm: '1000' });
    // The first trip is due in a quarter of an hour, so recording its departure is in time.
    const soon = guatemalaAgo(-15);
    const inTwoDays = dayFromToday(2);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: soon.day,
      time: soon.time,
    });
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: inTwoDays,
      time: '05:30',
    });

    // The first trip leaves two hours ago and arrives now.
    await branch.goto(`/sucursal/viajes?desde=${soon.day}&hasta=${soon.day}`);
    const firstTrip = branch.getByRole('row', { name: plateTail });
    await expect(firstTrip).toHaveCount(1, { timeout: ACTION_TIMEOUT });
    await firstTrip.getByRole('link').click();
    await expect(branch).toHaveURL(/\/sucursal\/viajes\/[0-9a-f-]{36}$/, {
      timeout: ACTION_TIMEOUT,
    });
    const tripId = branch.url().split('/').pop()!;
    // Until the bus leaves, the trip is on sale to everyone.
    await expect
      .poll(() => queryLocal('ventas', `SELECT 1 FROM trips WHERE trip_id = '${tripId}'`).length, {
        timeout: 90_000,
        intervals: [3_000],
      })
      .toBe(1);
    // A client looks for the trip on the public pages.
    const clientEmail = testEmail(`cycle-client-${testInfo.project.name}`);
    const api = await playwrightRequest.newContext({ baseURL: GATEWAY });
    await signUpClient(api, inbox!, clientEmail, `${origin} Cliente`);
    await api.dispose();
    const { page: shop, context: shopContext } = await signInClientPage(
      browser,
      baseURL!,
      clientEmail,
    );
    await expect(await listedTrips(shop, soon.day, origin, destination)).toHaveCount(1);

    const departure = guatemalaAgo(120);
    await expect(branch.getByLabel('Kilometraje inicial')).toHaveValue('1000');
    await branch.getByLabel('Fecha', { exact: true }).fill(departure.day);
    await branch.getByLabel('Hora', { exact: true }).fill(departure.time);
    await branch.getByRole('button', { name: 'Registrar salida' }).click();
    await confirmDialog(branch, 'Sí, registrar salida', CHECK);
    await expect(branch.getByText('Registrada, no editable')).toBeVisible();

    // Its scheduled hour is still ahead, but ventas stops selling it as soon as it hears the bus left.
    await expect
      .poll(
        () =>
          queryLocal('ventas', `SELECT 1 FROM departed_trips WHERE trip_id = '${tripId}'`).length,
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBe(1);
    await expect(await listedTrips(shop, soon.day, origin, destination)).toHaveCount(0);
    await shop.goto(`/viajes/${tripId}/asientos`);
    await expect(shop.getByText('Este viaje ya salió. Elige otro horario.')).toBeVisible();
    await shopContext.close();

    await branch.getByLabel('Kilometraje final').fill('1204');
    await branch.getByLabel('Combustible total (Q)').fill('1180');
    await expect(branch.getByText('Recorrido').locator('..')).toContainText('204 km');
    await branch.getByRole('button', { name: 'Registrar llegada' }).click();
    await confirmDialog(branch, 'Sí, registrar llegada', CHECK);
    await expect(branch.getByText('Registrada, no editable')).toHaveCount(2);

    // Neither record can be edited, not even after reloading the page.
    await branch.reload();
    await expect(branch.getByText('Registrada, no editable')).toHaveCount(2);
    await expect(branch.getByRole('textbox')).toHaveCount(0);

    // administracion keeps the fuel and the depreciation of the trip, by TripCompleted.
    await expect
      .poll(
        () =>
          queryLocal(
            'administracion',
            `SELECT distance_km || '|' || fuel_cost || '|' || (round(distance_km * depreciation_per_km, 2) = depreciation_amount) FROM trip_costs WHERE trip_id = '${tripId}'`,
          )[0],
        { timeout: 90_000, intervals: [3_000] },
      )
      .toBe('204|1180.00|true');

    // flota raises the mileage of the bus and counts the trip, also by TripCompleted.
    await expect(async () => {
      await branch.goto('/sucursal/buses');
      const busRow = branch.getByRole('row', { name: plateTail });
      await expect(busRow).toContainText('1,204');
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expect(
      branch.getByRole('row', { name: plateTail }).getByRole('cell', { name: '1', exact: true }),
    ).toBeVisible();

    // The first trip arrived: its bus can take a trip inside the hours it was scheduled for.
    const inside = guatemalaAgo(-45);
    await scheduleTrip(branch, {
      destination: `destino ${stamp}`,
      plate,
      day: inside.day,
      time: inside.time,
    });
    await branch.goto(`/sucursal/viajes?desde=${soon.day}&hasta=${inside.day}`);
    await expect(branch.getByRole('row', { name: plateTail })).toHaveCount(2);

    // A repair of the bus is registered with two lines and shows in the list with its total.
    await branch.goto('/sucursal/gastos/nuevo');
    await branch.getByRole('combobox', { name: 'Bus' }).click();
    await branch.getByRole('option', { name: plateTail }).click();
    const first = branch.getByRole('group', { name: 'Línea 1' });
    await first.getByRole('combobox', { name: 'Categoría' }).click();
    await branch.getByRole('option', { name: 'Llantas' }).click();
    await first.getByLabel('Monto (Q)').fill('5200');
    await branch.getByRole('button', { name: 'Agregar línea' }).click();
    const second = branch.getByRole('group', { name: 'Línea 2' });
    await second.getByRole('combobox', { name: 'Categoría' }).click();
    await branch.getByRole('option', { name: 'Cambio de aceite' }).click();
    await second.getByLabel('Monto (Q)').fill('350.50');
    await branch.getByRole('button', { name: 'Guardar gasto' }).click();
    await expect(branch).toHaveURL(/\/sucursal\/gastos$/);
    const repair = branch.getByRole('row', { name: plateTail });
    await expect(repair).toContainText(/Q\s?5,550\.50/);
    await expect
      .poll(
        () =>
          queryLocal(
            'administracion',
            `SELECT total FROM repair_expenses WHERE bus_plate LIKE '%${plate.slice(-3)}'`,
          )[0],
        { timeout: 30_000 },
      )
      .toBe('5550.50');
    // The trips that have not left are deleted, and the bus can be deactivated once flota forgets them.
    await deleteScheduledTrip(branch, inTwoDays, plateTail);
    await deleteScheduledTrip(branch, inside.day, plateTail);
    await expect(async () => {
      await branch.goto('/sucursal/buses');
      await branch.getByRole('button', { name: /Acciones de/ }).click();
      await branch.getByRole('menuitem', { name: 'Desactivar' }).click();
      await branch.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();
      await expect(branch.getByRole('row', { name: plateTail })).toContainText('Inactivo');
    }).toPass({ timeout: 90_000, intervals: [3_000] });

    await context.close();
  });
});
