import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import {
  exampleCounterTicketSold,
  exampleRentalCancelled,
  exampleRentalPaid,
  exampleTicketSold,
} from '@debus/contracts';
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
import {
  expectPdfDownload,
  recordArrival,
  recordDeparture,
  registerRepair,
  tripOf,
} from './support/real-trip-cycle';

const POLL = { timeout: 90_000, intervals: [3_000] };
const BASE = '/admin/reportes';

// "Q 3,015.00" as the screens write it, whatever the space between the symbol and the number.
const money = (amount: number) =>
  new RegExp(
    `${amount < 0 ? '-' : ''}Q\\s?${Math.abs(amount)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .replace(/[.,]/g, (mark) => `\\${mark}`)}`,
  );
const round2 = (value: number) => Math.round(value * 100) / 100;

// How many lines of each kind the repair of the branch has and what they add up to, as reportes
// stored them.
function repairByKind(branchId: string) {
  const kinds = Object.fromEntries(
    queryLocal(
      'reportes',
      `SELECT kind, count(*), sum(amount) FROM branch_report_repair_lines
       WHERE branch_id = '${branchId}' GROUP BY kind`,
    ).map((line) => {
      const [kind, lines, amount] = line.split('|') as [string, string, string];
      return [kind, { lines: Number(lines), amount: Number(amount) }];
    }),
  ) as Record<string, { lines: number; amount: number } | undefined>;
  return {
    labor: kinds.LABOR ?? { lines: 0, amount: 0 },
    parts: kinds.PART ?? { lines: 0, amount: 0 },
  };
}

async function openReport(admin: Page, path: string, branchId: string, extra = '') {
  await admin.goto(`${BASE}/${path}?sucursal=${branchId}${extra}`);
}

test.describe('real system reports: income, expenses, profit, top routes, workshop and map', () => {
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
  // Removes the rows of this run from every local database, the read models of reportes included.
  test.afterAll(() => cleanUpTestRun());

  test('every report of the system administrator adds up what one branch earned and spent', async ({
    page: admin,
    baseURL,
    browser,
  }, testInfo) => {
    const inbox = mailpitUrl(baseURL);
    test.skip(!inbox || !(await isReachable(inbox)), 'needs a reachable Mailpit');
    const stamp = `${testInfo.project.name}-${Date.now()}`;
    const origin = `${TEST_BRANCH_PREFIX}${TEST_RUN} origen ${stamp}`;
    const destination = `${TEST_BRANCH_PREFIX}${TEST_RUN} destino ${stamp}`;
    const branchAdmin = testEmail(`sysreport-${testInfo.project.name}`);
    const plate = `Z${Math.floor(100 + Math.random() * 900)}${randomLetters(3)}`;
    const plateTail = new RegExp(plate.slice(-3));
    const license = `L${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const today = guatemalaAgo(0).day;

    // The data of one test branch, made through the pages of the branch like a person would.
    await signInAsRealAdmin(admin, inbox!, process.env.E2E_ADMIN_EMAIL!);
    await createBranch(admin, origin, branchAdmin);
    await createBranch(admin, destination, testEmail(`sysreport-dest-${testInfo.project.name}`));
    const { page: branch, context } = await signInAsBranchAdmin(
      browser,
      baseURL!,
      inbox!,
      branchAdmin,
    );
    await createRoute(branch, `destino ${stamp}`);
    await registerDriver(branch, {
      name: 'Chofer de Reporte',
      email: testEmail(`sysreport-driver-${testInfo.project.name}`),
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
    await branch.goto(tripPage);
    await recordArrival(branch, '1204', '1180');
    await registerRepair(branch, plateTail);

    // The events of the trip, the route and the repair take a moment to reach reportes.
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT count(*) FROM branch_report_trips
             WHERE bus_plate = '${plate}' AND arrived_at IS NOT NULL AND fuel_cost IS NOT NULL`,
          )[0],
        POLL,
      )
      .toBe('1');
    const trip = tripOf(plate);
    const branchId = trip.branchId;
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT count(*) FROM branch_report_repair_lines WHERE branch_id = '${branchId}'`,
          )[0],
        POLL,
      )
      .toBe('2');
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT count(*) FROM system_report_routes WHERE id = '${trip.routeId}' AND active`,
          )[0],
        POLL,
      )
      .toBe('1');

    // ventas and clientes are not driven here: their events are published to the emulator as they
    // would, with the ids of the real trip and branch, and reach reportes through Pub/Sub.
    const sale = {
      tripId: trip.tripId,
      routeId: trip.routeId,
      branchId,
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
    const paidClient = `Colegio de Reporte ${stamp}`;
    const cancelledClient = `Colegio Cancelado ${stamp}`;
    const cancelledRental = randomUUID();
    await publishLocalEvent('RentalPaid', {
      ...exampleRentalPaid,
      rentalId: randomUUID(),
      branchId,
      clientName: paidClient,
      email: null,
      paidOn: today,
    });
    await publishLocalEvent('RentalPaid', {
      ...exampleRentalPaid,
      rentalId: cancelledRental,
      branchId,
      clientName: cancelledClient,
      email: null,
      price: 1500,
      paidOn: today,
    });
    await publishLocalEvent('RentalCancelled', {
      ...exampleRentalCancelled,
      rentalId: cancelledRental,
      branchId,
      tripId: null,
    });
    // Both the cancelled rental and its cancellation have arrived, so its absence below is a fact.
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT (SELECT count(*) FROM branch_report_rentals WHERE id = '${cancelledRental}')
                  + (SELECT count(*) FROM branch_report_rental_cancellations
                     WHERE rental_id = '${cancelledRental}')`,
          )[0],
        POLL,
      )
      .toBe('2');
    await expect
      .poll(
        () =>
          queryLocal(
            'reportes',
            `SELECT count(*) FROM branch_report_ticket_sales WHERE branch_id = '${branchId}'`,
          )[0],
        POLL,
      )
      .toBe('2');

    // What the screens have to add up to.
    const income = 255 + 2760;
    const repair = repairByKind(branchId);
    const labor = repair.labor.amount;
    const parts = repair.parts.amount;
    const fuel = trip.fuelCost;
    const depreciation = trip.depreciationAmount;
    const expenses = round2(fuel + depreciation + labor + parts);
    const profit = round2(income - expenses);
    const margin = (Math.round((profit / income) * 1000) / 10).toFixed(1);
    expect(fuel).toBe(1180);
    expect(round2(labor + parts)).toBe(5550.5);

    // 1. Income: the two tickets and the rental that was not cancelled, with their subtotal and total.
    await expect(async () => {
      await openReport(admin, 'ingresos', branchId);
      const table = admin.getByRole('table', { name: 'Ingresos por sucursal' });
      await expect(table.getByRole('row')).toHaveCount(6);
      await expect(table.getByRole('row', { name: /Boleto en línea/ })).toContainText(money(170));
      await expect(table.getByRole('row', { name: /Boleto de ventanilla/ })).toContainText(
        money(85),
      );
      await expect(table.getByRole('row', { name: new RegExp(paidClient) })).toContainText(
        money(2760),
      );
      await expect(table.getByRole('row', { name: `Subtotal de ${origin}` })).toContainText(
        money(3015),
      );
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(money(3015));
    }).toPass(POLL);
    await expect(admin.getByRole('table', { name: 'Ingresos por sucursal' })).not.toContainText(
      cancelledClient,
    );
    await expect(admin.getByRole('region', { name: 'Resumen del reporte' })).toContainText(
      money(3015),
    );
    await expectPdfDownload(admin, 'reporte-ingresos');

    // 2. Expenses: fuel, the depreciation the trip stored, workshop labor and parts.
    await expect(async () => {
      await openReport(admin, 'gastos', branchId);
      const table = admin.getByRole('table', { name: 'Gastos por sucursal' });
      await expect(table.getByRole('row', { name: /Combustible/ })).toContainText(money(fuel));
      await expect(table.getByRole('row', { name: 'Total global' })).toContainText(money(expenses));
    }).toPass(POLL);
    const spending = admin.getByRole('table', { name: 'Gastos por sucursal' });
    // Only the amounts above zero are expenses: a depreciation of zero has no row.
    await expect(spending.getByRole('row', { name: /Depreciación/ })).toHaveCount(
      depreciation > 0 ? 1 : 0,
    );
    if (depreciation > 0) {
      await expect(spending.getByRole('row', { name: /Depreciación/ })).toContainText(
        money(depreciation),
      );
    }
    for (const [label, { lines, amount }] of [
      ['Mano de obra', repair.labor],
      ['Repuestos', repair.parts],
    ] as const) {
      const kindRows = spending.getByRole('row', { name: new RegExp(`^.*${label}`) });
      await expect(kindRows).toHaveCount(lines);
      if (lines === 1) await expect(kindRows).toContainText(money(amount));
    }
    await expect(spending.getByRole('row', { name: `Subtotal de ${origin}` })).toContainText(
      money(expenses),
    );
    await expectPdfDownload(admin, 'reporte-gastos');

    // 3. Profit: the branch row agrees with the two reports above.
    await openReport(admin, 'ganancias', branchId);
    const profitTable = admin.getByRole('table', { name: 'Ganancias por sucursal' });
    const profitRow = profitTable.getByRole('row', { name: new RegExp(origin) });
    await expect(profitRow).toContainText(money(income));
    await expect(profitRow).toContainText(money(expenses));
    await expect(profitRow).toContainText(money(profit));
    await expect(profitRow).toContainText(
      `${Number(margin).toLocaleString('es-GT', { minimumFractionDigits: 1 })} %`,
    );
    await expect(profitTable.getByRole('row', { name: 'Total global' })).toContainText(
      money(profit),
    );
    await admin.getByRole('button', { name: new RegExp(origin) }).click();
    const breakdown = admin.getByRole('region', { name: `Desglose de ${origin}` });
    await expect(breakdown).toContainText(money(255));
    await expect(breakdown).toContainText(money(2760));
    await expect(breakdown).toContainText(money(fuel));
    await expectPdfDownload(admin, 'reporte-ganancias');

    // 4. Top routes: the one route of the branch with its three tickets.
    await openReport(admin, 'rutas-demandadas', branchId);
    const routes = admin.getByRole('table', { name: 'Rutas más demandadas' });
    await expect(routes.getByRole('row')).toHaveCount(3);
    const routeRow = routes.getByRole('row', { name: /→/ });
    await expect(routeRow).toContainText(`${trip.originLabel} → ${trip.destinationLabel}`);
    await expect(routeRow).toContainText('214.3 km');
    await expect(routeRow.getByRole('cell', { name: '3', exact: true }).first()).toBeVisible();
    await expect(routeRow).toContainText(money(255));
    await expect(routes.getByRole('row', { name: 'Total' })).toContainText(money(255));
    await expectPdfDownload(admin, 'reporte-rutas-demandadas');

    // 5. Workshop: each category with its subtotal and the general total, and the bus filter.
    await openReport(admin, 'taller', branchId);
    const workshop = admin.getByRole('table', { name: 'Gastos de taller por categoría' });
    await expect(workshop.getByRole('row', { name: 'Subtotal de Llantas' })).toContainText(
      money(5200),
    );
    await expect(workshop.getByRole('row', { name: 'Subtotal de Cambio de aceite' })).toContainText(
      money(350.5),
    );
    await expect(workshop.getByRole('row', { name: 'Total general' })).toContainText(money(5550.5));
    await admin.getByRole('combobox', { name: 'Bus' }).click();
    await admin.getByRole('option', { name: plateTail }).click();
    await expect(admin).toHaveURL(new RegExp(`bus=${trip.busId}`));
    await expect(workshop.getByRole('row', { name: 'Total general' })).toContainText(money(5550.5));
    await expectPdfDownload(admin, 'reporte-taller');
    await openReport(admin, 'taller', branchId, `&bus=${randomUUID()}`);
    await expect(admin.getByText('Ese bus todavía no tiene gastos de taller.')).toBeVisible();

    // 6. Map: the branch with its route, the destination, the kilometres, the price and the tickets.
    await expect(async () => {
      await openReport(admin, 'mapa-rutas', branchId);
      const panel = admin.getByRole('region', { name: 'Rutas de la sucursal' });
      await expect(panel).toContainText(origin);
      await expect(panel).toContainText('1 ruta activa');
      const [item] = await panel.getByRole('listitem').all();
      await expect(item!).toContainText(destination);
      await expect(item!).toContainText('214.3 km');
      await expect(item!).toContainText('3 boletos vendidos');
      await expect(item!).toContainText(money(70));
    }).toPass(POLL);
    const map = admin.getByRole('region', { name: 'Mapa de Guatemala' });
    await expect(map.getByRole('img', { name: `Sucursal de origen: ${origin}` })).toBeVisible();
    await expect(map.getByRole('img', { name: `Destino con ruta: ${destination}` })).toBeVisible();
    await expectPdfDownload(admin, 'reporte-mapa-rutas');

    await context.close();
  });
});
