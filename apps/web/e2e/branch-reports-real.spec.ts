import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { exampleCounterTicketSold, exampleRentalPaid, exampleTicketSold } from '@debus/contracts';
import { type Page, expect, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { guatemalaAgo } from './support/guatemala-time';
import { queryLocal } from './support/local-sql';
import { isLocalStack } from './support/local-stack';
import { isReachable, mailpitUrl } from './support/mailpit';
import { publishLocalEvent } from './support/pubsub-emulator';
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
  await expect(branch).toHaveURL(/\/sucursal\/viajes\/[0-9a-f-]{36}$/, { timeout: ACTION_TIMEOUT });
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

async function recordArrival(branch: Page) {
  await expect(branch.getByLabel('Kilometraje final')).toBeVisible();
  await branch.getByLabel('Kilometraje final').fill('1204');
  await branch.getByLabel('Combustible total (Q)').fill('1180');
  await branch.getByRole('button', { name: 'Registrar llegada' }).click();
  const dialog = branch.getByRole('alertdialog');
  await dialog.getByRole('checkbox', { name: CHECK }).click();
  await dialog.getByRole('button', { name: 'Sí, registrar llegada' }).click();
  await expect(dialog).toBeHidden();
  await expect(branch.getByText('Registrada, no editable')).toHaveCount(2);
}

async function registerRepair(branch: Page, plateTail: RegExp) {
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
}

// The ids of the trip as reportes already knows it, so the sales published for it match the real trip.
function tripOf(plate: string) {
  const [line] = queryLocal(
    'reportes',
    `SELECT id, route_id, branch_id, bus_id, origin_label, destination_label,
            to_char(departure_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     FROM branch_report_trips WHERE bus_plate = '${plate}' AND deleted_at IS NULL`,
  );
  const [tripId, routeId, branchId, busId, originLabel, destinationLabel, departureAt] =
    line!.split('|');
  return { tripId, routeId, branchId, busId, originLabel, destinationLabel, departureAt };
}

async function expectPdfDownload(branch: Page, stem: string) {
  const download = branch.waitForEvent('download');
  await branch.getByRole('button', { name: 'Exportar PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^${stem}-\\d{4}-\\d{2}-\\d{2}\\.pdf$`));
  expect(
    readFileSync((await file.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
}

test.describe('real branch reports: buses, drivers, depreciation, repairs and income', () => {
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

  test('a bus that left shows on the road with its driver and, once the trip ends, the driver has a completed trip', async ({
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
    const tripPage = branch.url();

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

    await expectPdfDownload(branch, 'reporte-buses');

    // The arrival reaches reportes by TripCompleted: the driver now has one completed trip.
    await branch.goto(tripPage);
    await recordArrival(branch);
    await expect(async () => {
      await branch.goto('/sucursal/reportes/choferes');
      const row = branch.getByRole('row', { name: /Chofer de Reporte/ });
      await expect(row).toContainText('Activo');
      await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expectPdfDownload(branch, 'reporte-choferes');

    // The same arrival gives the bus its 204 km (1,204 less the 1,000 it started with), also in a
    // period that holds only today.
    const today = guatemalaAgo(0).day;
    await expect(async () => {
      await branch.goto('/sucursal/reportes/depreciacion');
      const row = branch.getByRole('row', { name: plateTail });
      await expect(row).toContainText('204 km');
      await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expect(branch.getByRole('button', { name: /Periodo/ })).toContainText(
      'Todos los registros',
    );
    await branch.goto(`/sucursal/reportes/depreciacion?desde=${today}&hasta=${today}`);
    await expect(branch.getByRole('row', { name: plateTail })).toContainText('204 km');
    await expectPdfDownload(branch, 'reporte-depreciacion');

    // A repair with two lines of different categories reaches reportes by RepairExpenseAdded: the bus
    // shows with its total and, once opened, with the subtotal of each category.
    await registerRepair(branch, plateTail);
    await expect(async () => {
      await branch.goto('/sucursal/reportes/taller');
      await expect(branch.getByRole('row', { name: plateTail })).toContainText(/Q\s?5,550\.50/);
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await branch.getByRole('button', { name: plateTail }).click();
    const categories = branch.getByRole('region', { name: /^Categorías de/ });
    await expect(categories).toContainText('Llantas');
    await expect(categories).toContainText(/Q\s?5,200\.00/);
    await expect(categories).toContainText('Cambio de aceite');
    await expect(categories).toContainText(/Q\s?350\.50/);
    await expectPdfDownload(branch, 'reporte-taller');

    // ventas and clientes are not driven here: their events are published to the emulator as they
    // would, with the ids of the real trip and branch, and reach reportes through Pub/Sub.
    const trip = tripOf(plate);
    const sale = {
      tripId: trip.tripId,
      routeId: trip.routeId,
      branchId: trip.branchId,
      busId: trip.busId,
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
      departureAt: trip.departureAt,
      paidOn: today,
    };
    await publishLocalEvent('TicketSold', {
      ...exampleTicketSold,
      ...sale,
      ticketId: randomUUID(),
    });
    await publishLocalEvent('TicketSold', {
      ...exampleCounterTicketSold,
      ...sale,
      ticketId: randomUUID(),
    });
    await expect(async () => {
      await branch.goto('/sucursal/reportes/ingresos-boletos');
      const row = branch.getByRole('row', { name: plateTail });
      await expect(row).toContainText(/Q\s?255\.00/);
      await expect(row.getByRole('cell', { name: '3', exact: true })).toBeVisible();
      await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible();
      await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expect(branch.getByRole('heading', { name: 'Ingresos por ruta' })).toBeVisible();
    await branch.goto(`/sucursal/reportes/ingresos-boletos?desde=${today}&hasta=${today}`);
    await expect(branch.getByRole('row', { name: plateTail })).toContainText(/Q\s?255\.00/);
    await expectPdfDownload(branch, 'reporte-ingresos-boletos');

    const client = `Colegio de Reporte ${stamp}`;
    await publishLocalEvent('RentalPaid', {
      ...exampleRentalPaid,
      rentalId: randomUUID(),
      branchId: trip.branchId,
      clientName: client,
      // No confirmation email: this run only checks the report.
      email: null,
      paidOn: today,
    });
    await expect(async () => {
      await branch.goto('/sucursal/reportes/ingresos-alquileres');
      const row = branch.getByRole('row', { name: new RegExp(client) });
      await expect(row).toContainText(/Q\s?2,760\.00/);
      await expect(row).toContainText('Por asignar');
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expectPdfDownload(branch, 'reporte-ingresos-alquileres');

    await context.close();
  });
});
