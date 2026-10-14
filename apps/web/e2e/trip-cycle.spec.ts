import { expect, test, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import {
  FLEET_BRANCH_ID,
  mockFleetGateway,
  sampleBus,
  sampleDriver,
  sampleRoute,
} from './support/fleet-gateway';
import { guatemalaAgo } from './support/guatemala-time';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';
import { type TripCycleSeed, sampleRental } from './support/trip-cycle-gateway';
import { type TripsSeed, instantAt, mockTripsGateway, sampleTrip } from './support/trips-gateway';

// The id of the signed in user (see sessionFor): a driver's account carries the id of the driver.
const DRIVER_USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const GUATEMALA_ID = '5d1f3a20-2222-4d4d-9999-123456789abc';

const julio = sampleDriver({ id: DRIVER_USER_ID, fullName: 'Julio Pérez', baseSalary: 150 });
const ana = sampleDriver({
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  licenseNumber: 'B7654321',
  baseSalary: 160,
});
const volvo = sampleBus({ plate: 'C482BTX', capacity: 40, mileageKm: 148410 });
const scania = sampleBus({ plate: 'C731PLR', brand: 'Scania', model: 'K360', capacity: 44 });
const small = sampleBus({ plate: 'C055DFG', brand: 'Hino', model: 'RK8', capacity: 30 });
const parked = sampleBus({ plate: 'C340RTE', active: false, mileageKm: 90000 });
const guatemala = sampleRoute({
  destinationBranchId: GUATEMALA_ID,
  destinationName: 'Guatemala',
  distanceKm: 201,
});

const scheduled = (over: Parameters<typeof sampleTrip>[0] = {}) =>
  sampleTrip({
    routeId: guatemala.id,
    busId: volvo.id,
    busPlate: 'C482BTX',
    driverId: julio.id,
    driverName: 'Julio Pérez',
    departureAt: instantAt(0, '05:30'),
    estimatedArrivalAt: instantAt(0, '10:30'),
    ...over,
  });

interface Options {
  role?: 'BRANCH_ADMIN' | 'DRIVER';
  trips?: TripsSeed['trips'];
  cycle?: TripCycleSeed;
}

async function open(page: Page, baseURL: string | undefined, path: string, options: Options = {}) {
  const role = options.role ?? 'BRANCH_ADMIN';
  await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
  const fleet = await mockFleetGateway(page, {
    drivers: [julio, ana],
    buses: [volvo, scania, small, parked],
    routes: [guatemala],
  });
  const gateway = await mockTripsGateway(page, fleet, {
    trips: options.trips ?? [],
    cycle: {
      actingAs: role === 'DRIVER' ? { role, driverId: DRIVER_USER_ID } : { role },
      ...options.cycle,
    },
  });
  await signInAs(page, baseURL!, role, FLEET_BRANCH_ID);
  await page.goto(path);
  return gateway;
}

const CHECK = 'Revisé los datos: no se podrán cambiar';

async function confirm(page: Page, button: string, check = CHECK) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: button })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: check }).click();
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toBeHidden();
}

test.describe('trip cycle', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('the admin opens a trip, records the departure and the arrival, and neither can change', async ({
    page,
    baseURL,
  }) => {
    const trip = scheduled();
    const gateway = await open(page, baseURL, '/sucursal/viajes', { trips: [trip] });

    await page.getByRole('link', { name: /Quetzaltenango.*Guatemala/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sucursal/viajes/${trip.id}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Quetzaltenango a Guatemala' }),
    ).toBeVisible();
    await expect(page.getByLabel('Kilometraje inicial')).toHaveValue('148410');
    await expect(page.getByText('Primero registra la salida.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // It left two hours ago, so the arrival of now is after it: the same minute is refused.
    const left = guatemalaAgo(120);
    await page.getByLabel('Fecha', { exact: true }).fill(left.day);
    await page.getByLabel('Hora', { exact: true }).fill(left.time);
    await page.getByRole('button', { name: 'Registrar salida' }).click();
    await confirm(page, 'Sí, registrar salida');

    await expect(page.getByText('Registrada, no editable')).toBeVisible();
    await expect(page.getByText('Registrada por el admin de sucursal')).toBeVisible();
    await expect(page.getByLabel('Kilometraje final')).toBeVisible();
    expect(gateway.requests.find((r) => r.path.endsWith('/departure'))?.body).toMatchObject({
      startMileageKm: 148410,
    });

    await page.getByLabel('Kilometraje final').fill('148614');
    await page.getByLabel('Combustible total (Q)').fill('1180');
    await expect(page.getByText('Recorrido').locator('..')).toContainText('204 km');
    await expect(page.getByText(/Depreciación/).locator('..')).toContainText(/Q\s?173\.40/);
    await expect(page.getByText('Pago al chofer').locator('..')).toContainText(/Q\s?150\.00/);
    await page.getByRole('button', { name: 'Registrar llegada' }).click();
    await confirm(page, 'Sí, registrar llegada');

    await expect(page.getByText('Registrada, no editable')).toHaveCount(2);
    await expect(page.getByText('148,614 km')).toBeVisible();
    await expect(page.getByRole('button', { name: /Registrar/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.reload();
    await expect(page.getByText('Registrada, no editable')).toHaveCount(2);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });

  test('the confirmation stays disabled until the person checks the box', async ({
    page,
    baseURL,
  }) => {
    const trip = scheduled();
    await open(page, baseURL, `/sucursal/viajes/${trip.id}`, { trips: [trip] });

    await page.getByRole('button', { name: 'Registrar salida' }).click();

    const dialog = page.getByRole('alertdialog');
    const submit = dialog.getByRole('button', { name: 'Sí, registrar salida' });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('checkbox', { name: CHECK }).click();
    await expect(submit).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Registrada, no editable')).toHaveCount(0);
  });

  test('the service answers a mileage that is too low next to the form, and the person fixes it', async ({
    page,
    baseURL,
  }) => {
    const trip = scheduled();
    await open(page, baseURL, `/sucursal/viajes/${trip.id}`, { trips: [trip] });

    await page.getByLabel('Kilometraje inicial').fill('100000');
    await page.getByRole('button', { name: 'Registrar salida' }).click();
    await confirm(page, 'Sí, registrar salida');

    await expect(page.getByRole('alert').filter({ hasText: 'kilometraje' })).toContainText(
      'El kilometraje inicial no puede ser menor que el último registrado del bus.',
    );
    await expect(page.getByLabel('Fecha')).toBeFocused();
    await expect(page.getByText('Registrada, no editable')).toHaveCount(0);

    await page.getByLabel('Kilometraje inicial').fill('148420');
    await page.getByRole('button', { name: 'Registrar salida' }).click();
    await confirm(page, 'Sí, registrar salida');

    await expect(page.getByText('Registrada, no editable')).toBeVisible();
    await expect(page.getByText('148,420 km')).toBeVisible();
  });

  test('a trip with a deactivated bus warns and does not let the departure through', async ({
    page,
    baseURL,
  }) => {
    const trip = scheduled({ busId: parked.id, busPlate: 'C340RTE' });
    await open(page, baseURL, `/sucursal/viajes/${trip.id}`, { trips: [trip] });

    await expect(page.getByRole('alert').filter({ hasText: 'desactivado' })).toContainText(
      'El bus de este viaje fue desactivado',
    );
    await expect(page.getByRole('button', { name: 'Registrar salida' })).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });

  test('deleting a scheduled trip goes back to the list without it; one on the road cannot be deleted', async ({
    page,
    baseURL,
  }) => {
    const toDelete = scheduled({ destinationName: 'Cobán' });
    const onTheRoad = scheduled({
      destinationName: 'Flores',
      status: 'IN_TRANSIT',
      busId: scania.id,
      busPlate: 'C731PLR',
      driverId: ana.id,
      driverName: 'Ana Sic',
    });
    await open(page, baseURL, `/sucursal/viajes/${toDelete.id}`, {
      trips: [toDelete, onTheRoad],
      cycle: {
        records: [
          {
            tripId: onTheRoad.id,
            departure: {
              departedAt: instantAt(0, '05:34'),
              startMileageKm: 5000,
              recordedByRole: 'DRIVER',
            },
          },
        ],
      },
    });

    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await confirm(page, 'Eliminar viaje', 'Entiendo que se avisará a quienes compraron boletos.');

    await expect(page).toHaveURL(/\/sucursal\/viajes$/);
    await expect(page.getByRole('row', { name: /Cobán/ })).toHaveCount(0);
    await page.getByRole('link', { name: /Quetzaltenango.*Flores/ }).click();
    await expect(
      page.getByText(
        'No disponible: el viaje ya salió. Solo se eliminan viajes que no han salido.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar', exact: true })).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });

  test('an unknown trip says so and leads back', async ({ page, baseURL }) => {
    await open(page, baseURL, '/sucursal/viajes/00000000-0000-4000-8000-000000000000');

    await expect(page.getByText('No encontramos ese viaje.')).toBeVisible();
    await page.getByRole('link', { name: 'Volver a los viajes' }).click();
    await expect(page).toHaveURL(/\/sucursal\/viajes$/);
  });

  test('the driver lands on their trips, sees only their own, records a departure and cannot delete', async ({
    page,
    baseURL,
  }) => {
    const mine = scheduled();
    const hers = scheduled({
      destinationName: 'Flores',
      busId: scania.id,
      busPlate: 'C731PLR',
      driverId: ana.id,
      driverName: 'Ana Sic',
    });
    await open(page, baseURL, '/sucursal', { role: 'DRIVER', trips: [mine, hers] });

    await expect(page).toHaveURL(/\/chofer$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mis viajes' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Mis viajes' }).locator('tbody tr')).toHaveCount(
      1,
    );
    await expect(page.getByRole('link', { name: /Quetzaltenango.*Flores/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: /Quetzaltenango.*Guatemala/ }).click();
    await expect(page).toHaveURL(new RegExp(`/chofer/viajes/${mine.id}$`));
    await expect(page.getByRole('heading', { name: 'Eliminar viaje' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Registrar salida' }).click();
    await confirm(page, 'Sí, registrar salida');

    await expect(page.getByText('Registrada por el chofer')).toBeVisible();
    await page.getByRole('link', { name: 'Mis viajes' }).first().click();
    await expect(page).toHaveURL(/\/chofer$/);
    await page.getByRole('tab', { name: 'En ruta' }).click();
    await expect(page).toHaveURL(/estado=en-ruta/);
    await expect(page.getByRole('table', { name: 'Mis viajes' }).locator('tbody tr')).toHaveCount(
      1,
    );

    await page.goto('/sucursal/viajes');
    await expect(page).toHaveURL(/\/chofer$/);
  });

  test('the driver reaches their trips from the menu', async ({ page, baseURL }) => {
    await open(page, baseURL, '/chofer', { role: 'DRIVER', trips: [scheduled()] });

    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Mis viajes', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viajes', exact: true })).toHaveCount(0);
  });

  test('a driver with a bus on the road sees it first, with the way to record the arrival', async ({
    page,
    baseURL,
  }) => {
    const running = scheduled({ status: 'IN_TRANSIT' });
    await open(page, baseURL, '/chofer', {
      role: 'DRIVER',
      trips: [running],
      cycle: {
        records: [
          {
            tripId: running.id,
            departure: {
              departedAt: instantAt(0, '05:34'),
              startMileageKm: 148410,
              recordedByRole: 'DRIVER',
            },
          },
        ],
      },
    });

    await expect(page.getByRole('region', { name: 'Viaje en ruta' })).toContainText(
      'Quetzaltenango a Guatemala',
    );
    await page.getByRole('link', { name: 'Registrar llegada' }).click();
    await expect(page).toHaveURL(new RegExp(`/chofer/viajes/${running.id}$`));
    await expect(page.getByLabel('Kilometraje final')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('an absurd final mileage shows its error and no figures, and nothing leaves its card', async ({
    page,
    baseURL,
  }) => {
    const running = scheduled({ status: 'IN_TRANSIT' });
    await open(page, baseURL, `/sucursal/viajes/${running.id}`, {
      trips: [running],
      cycle: {
        records: [
          {
            tripId: running.id,
            departure: {
              departedAt: instantAt(0, '05:34'),
              startMileageKm: 148410,
              recordedByRole: 'BRANCH_ADMIN',
            },
          },
        ],
      },
    });

    await page.getByLabel('Kilometraje final').fill('1483100');

    await expect(page.getByText(/demasiado alto para un solo viaje/)).toBeVisible();
    await expect(page.getByText('Recorrido').locator('..')).toContainText('—');
    await expect(page.getByText(/Depreciación/).locator('..')).not.toContainText('Q 1,');
    await expectNoHorizontalScroll(page);
    const cards = page.locator('[class*="rounded-[18px]"]');
    for (const card of await cards.all()) {
      const overflows = await card.evaluate(
        (element) => element.scrollWidth > element.clientWidth + 1,
      );
      expect(overflows).toBe(false);
    }
  });

  test('a rental waiting for a bus is assigned and becomes a trip called Alquiler', async ({
    page,
    baseURL,
  }) => {
    const rental = sampleRental();
    const gateway = await open(page, baseURL, '/sucursal/viajes', {
      cycle: { rentals: [rental] },
    });

    await expect(page.getByRole('tab', { name: /Alquileres por asignar/ })).toContainText('1');
    await page.getByRole('tab', { name: /Alquileres por asignar/ }).click();
    await expect(page).toHaveURL(/pestana=alquileres/);
    const row = page.getByRole('row', { name: /Colegio San José/ });
    await expect(row).toContainText('1234567-8');
    await expect(row).toContainText('Antigua Guatemala');
    await expect(row).toContainText('38');
    await expectNoHorizontalScroll(page);

    await row.getByRole('button', { name: /Asignar/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Asignar bus y chofer' });
    await expect(dialog.getByLabel('Hora de llegada')).toHaveValue('16:00');
    await dialog.getByRole('combobox', { name: 'Bus' }).click();
    await expect(
      page.getByRole('option', { name: 'C-055DFG · 30 asientos (menos asientos)' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('option', { name: 'C-731PLR · 44 asientos' }).click();
    await dialog.getByRole('combobox', { name: 'Chofer' }).click();
    await page.getByRole('option', { name: 'Ana Sic' }).click();
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();

    await expect(page.getByText('Asignamos el bus y el chofer a Colegio San José.')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('No hay alquileres esperando bus y chofer.')).toBeVisible();
    expect(gateway.requests.find((r) => r.path.endsWith('/assignment'))?.body).toMatchObject({
      busId: scania.id,
      driverId: ana.id,
    });

    await page.getByRole('tab', { name: 'Viajes' }).click();
    const trip = page.getByRole('row', { name: /Antigua Guatemala/ });
    await expect(trip).toContainText('Alquiler');
    await expect(trip).toContainText('C-731PLR');
  });

  test('keeps the count of every tab inside its tab, without scrolling the tab bar', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/sucursal/viajes', { cycle: { rentals: [sampleRental()] } });

    const bar = page.getByRole('tablist', { name: 'Qué ver' });
    const tab = bar.getByRole('tab', { name: /Alquileres por asignar/ });
    await expect(tab).toContainText('1');
    const [barBox, tabBox, countBox] = await Promise.all([
      bar.boundingBox(),
      tab.boundingBox(),
      tab.getByText('1', { exact: true }).boundingBox(),
    ]);

    expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(tabBox!.x + tabBox!.width + 0.5);
    expect(tabBox!.x + tabBox!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width + 0.5);
    const scrolls = await bar.evaluate((element) => {
      const frame = element.closest('.overflow-x-auto')!;
      return frame.scrollWidth > frame.clientWidth;
    });
    expect(scrolls).toBe(false);
    await expectNoHorizontalScroll(page);
  });

  test('assigning a bus that has a trip at that hour shows the clash next to the bus', async ({
    page,
    baseURL,
  }) => {
    const rental = sampleRental();
    const busy = scheduled({
      busId: scania.id,
      busPlate: 'C731PLR',
      driverId: ana.id,
      driverName: 'Ana Sic',
      departureAt: rental.departureAt,
      estimatedArrivalAt: rental.returnAt!,
    });
    await open(page, baseURL, '/sucursal/viajes?pestana=alquileres', {
      trips: [busy],
      cycle: { rentals: [rental] },
    });

    await page.getByRole('button', { name: /Asignar bus y chofer a/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Asignar bus y chofer' });
    await dialog.getByRole('combobox', { name: 'Bus' }).click();
    await page.getByRole('option', { name: 'C-731PLR · 44 asientos' }).click();
    await dialog.getByRole('combobox', { name: 'Chofer' }).click();
    await page.getByRole('option', { name: 'Julio Pérez' }).click();
    await dialog.getByRole('button', { name: 'Asignar', exact: true }).click();

    await expect(dialog.locator('#assign-bus-error')).toHaveText(
      'Ese bus ya tiene un viaje en ese horario.',
    );
    await expect(dialog.getByRole('combobox', { name: 'Bus' })).toBeFocused();
    await expectNoHorizontalScroll(page);
  });

  test('the panel lists the departures to record and updates the buses on the road by itself', async ({
    page,
    baseURL,
  }) => {
    const next = scheduled({
      departureAt: instantAt(0, '23:00'),
      estimatedArrivalAt: instantAt(0, '23:50'),
    });
    await page.clock.install();
    const gateway = await open(page, baseURL, '/sucursal', { trips: [next] });

    await expect(page.getByText('Cuando un bus salga, lo verás aquí.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Registrar salida de C-482BTX' })).toHaveAttribute(
      'href',
      `/sucursal/viajes/${next.id}`,
    );
    await expectNoHorizontalScroll(page);

    gateway.trips.push(
      scheduled({
        destinationName: 'Flores',
        status: 'IN_TRANSIT',
        busId: scania.id,
        busPlate: 'C731PLR',
        driverId: ana.id,
        driverName: 'Ana Sic',
      }),
    );
    await page.clock.runFor(61_000);

    await expect(page.getByRole('listitem', { name: /Flores/ })).toBeVisible();
  });
});
