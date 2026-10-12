import { expect, test, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import {
  FLEET_BRANCH_ID,
  mockFleetGateway,
  sampleBus,
  sampleDriver,
  sampleRoute,
} from './support/fleet-gateway';
import { type TripsSeed, instantAt, mockTripsGateway, sampleTrip } from './support/trips-gateway';
import { dayFromToday } from './support/fleet-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const GUATEMALA_ID = '5d1f3a20-2222-4d4d-9999-123456789abc';
const FLORES_ID = '6e2a4b31-3333-4e4e-8888-123456789abc';

const julio = sampleDriver({ fullName: 'Julio Pérez', licenseNumber: 'A1234567' });
const ana = sampleDriver({
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  licenseNumber: 'B7654321',
});
const volvo = sampleBus({
  plate: 'C482BTX',
  assignedDriverId: julio.id,
  assignedDriverName: julio.fullName,
});
const scania = sampleBus({ plate: 'C731PLR', brand: 'Scania', model: 'K360', capacity: 44 });
const guatemala = sampleRoute({ destinationBranchId: GUATEMALA_ID, destinationName: 'Guatemala' });
const flores = sampleRoute({
  destinationBranchId: FLORES_ID,
  destinationName: 'Flores',
  distanceKm: 560,
  ticketPrice: 150,
});

const fleetSeed = () => ({
  drivers: [julio, ana],
  buses: [volvo, scania],
  routes: [guatemala, flores],
});

async function open(page: Page, baseURL: string | undefined, path: string, trips: TripsSeed = {}) {
  await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
  const fleet = await mockFleetGateway(page, fleetSeed());
  const gateway = await mockTripsGateway(page, fleet, trips);
  await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
  await page.goto(path);
  return gateway;
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('dialog').getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

// Fills the dialog the way a person would: route, bus (its driver is proposed), then the departure.
async function fillTrip(page: Page, bus: RegExp, departureDay: string, time: string) {
  const dialog = page.getByRole('dialog', { name: 'Programar viaje' });
  await choose(page, 'Ruta', /Guatemala/);
  await choose(page, 'Bus', bus);
  await dialog.getByLabel('Día de salida').fill(departureDay);
  await dialog.getByLabel('Hora de salida').fill(time);
  return dialog;
}

test.describe('trips', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('is reached from the menu and starts empty with an invitation', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/sucursal');

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Viajes', exact: true }).click();

    await expect(page).toHaveURL(/\/sucursal\/viajes$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Viajes' })).toBeVisible();
    await expect(page.getByText('Operación · Quetzaltenango')).toBeVisible();
    await expect(page.getByLabel('Desde')).toHaveValue(dayFromToday(0));
    await expect(
      page.getByText('No hay viajes programados desde hoy. Crea el primero con «Programar viaje».'),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('schedules a trip with the driver and the arrival proposed', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL, '/sucursal/viajes');
    const tomorrow = dayFromToday(1);

    await page.getByRole('button', { name: 'Programar viaje' }).click();
    const dialog = await fillTrip(page, /C-482BTX/, tomorrow, '05:30');
    await expect(dialog.getByRole('combobox', { name: 'Chofer' })).toContainText('Julio Pérez');
    await expect(dialog.getByLabel('Día de llegada')).toHaveValue(tomorrow);
    await expect(dialog.getByLabel('Hora de llegada')).toHaveValue('10:30');
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Programar', exact: true }).click();

    await expect(page.getByText('Programamos el viaje a Guatemala.')).toBeVisible();
    await expect(dialog).toBeHidden();
    const row = page.getByRole('row', { name: /C-482BTX/ });
    await expect(row).toContainText('05:30');
    await expect(row).toContainText('10:30');
    await expect(row).toContainText('Quetzaltenango');
    await expect(row).toContainText('Julio Pérez');
    await expect(row).toContainText('Programado');
    expect(gateway.requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      routeId: guatemala.id,
      busId: volvo.id,
      driverId: julio.id,
      departureAt: instantAt(1, '05:30'),
      estimatedArrivalAt: instantAt(1, '10:30'),
    });
    await expectNoHorizontalScroll(page);
  });

  test('shows a clash of the bus next to its field and lets the person try another bus', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/sucursal/viajes', {
      trips: [
        sampleTrip({
          busId: volvo.id,
          busPlate: 'C482BTX',
          driverId: ana.id,
          driverName: ana.fullName,
          departureAt: instantAt(1, '05:00'),
          estimatedArrivalAt: instantAt(1, '11:00'),
        }),
      ],
    });

    await page.getByRole('button', { name: 'Programar viaje' }).click();
    const dialog = await fillTrip(page, /C-482BTX/, dayFromToday(1), '05:30');
    await dialog.getByRole('button', { name: 'Programar', exact: true }).click();

    await expect(dialog.locator('#trip-bus-error')).toHaveText(
      'Ese bus ya tiene un viaje en ese horario.',
    );
    await expect(dialog.getByRole('combobox', { name: 'Bus' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expectNoHorizontalScroll(page);

    await choose(page, 'Bus', /C-731PLR/);
    await dialog.getByRole('button', { name: 'Programar', exact: true }).click();

    await expect(page.getByText('Programamos el viaje a Guatemala.')).toBeVisible();
    await expect(page.getByRole('row', { name: /C-731PLR/ })).toContainText('Julio Pérez');
  });

  test('says what is missing before asking the service', async ({ page, baseURL }) => {
    const gateway = await open(page, baseURL, '/sucursal/viajes');

    await page.getByRole('button', { name: 'Programar viaje' }).click();
    const dialog = page.getByRole('dialog', { name: 'Programar viaje' });
    await expect(dialog.getByLabel('Día de salida')).toHaveValue(dayFromToday(0));
    await dialog.getByRole('button', { name: 'Programar', exact: true }).click();

    await expect(dialog.getByText('Elige la ruta del viaje.')).toBeVisible();
    await expect(dialog.getByText('Elige el bus.')).toBeVisible();
    await expect(dialog.getByText('Elige el chofer.')).toBeVisible();
    await expect(dialog.getByText('Elige la hora de salida.')).toBeVisible();
    expect(gateway.requests.some((r) => r.method === 'POST')).toBe(false);
    await expectNoHorizontalScroll(page);
  });

  test('shows the friendly text when the fleet service does not answer', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, '/sucursal/viajes', { fleetDown: true });

    await page.getByRole('button', { name: 'Programar viaje' }).click();
    const dialog = await fillTrip(page, /C-482BTX/, dayFromToday(1), '05:30');
    await dialog.getByRole('button', { name: 'Programar', exact: true }).click();

    await expect(dialog.getByRole('alert')).toHaveText(
      'El servicio no respondió. Intenta de nuevo en unos segundos.',
    );
    await expect(dialog).toBeVisible();
  });

  test('keeps days, state, search and page in the address after a reload', async ({
    page,
    baseURL,
  }) => {
    const trips = Array.from({ length: 45 }, (_, index) =>
      sampleTrip({
        busPlate: `C${String(index + 1).padStart(3, '0')}AAA`,
        destinationName: index % 3 === 0 ? 'Flores' : 'Guatemala',
        status: index < 5 ? 'IN_TRANSIT' : 'SCHEDULED',
        // ten minutes apart, so the order of the list is the order they were made in
        departureAt: instantAt(
          1,
          `${String(Math.floor(index / 6)).padStart(2, '0')}:${String((index % 6) * 10).padStart(2, '0')}`,
        ),
      }),
    );
    await open(page, baseURL, '/sucursal/viajes', { trips });

    const table = page.getByRole('table', { name: 'Viajes' });
    await expect(table.locator('tbody tr')).toHaveCount(20);
    await expect(page.getByText('Mostrando 1–20 de 45')).toBeVisible();
    const next = page.getByRole('button', { name: 'Página siguiente' });
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(page).toHaveURL(/pagina=2/);
    await page.reload();
    await expect(page.getByText('Mostrando 21–40 de 45')).toBeVisible();

    await page.getByRole('tab', { name: 'En camino' }).click();
    await expect(page).toHaveURL(/estado=en-camino/);
    await expect(page).not.toHaveURL(/pagina=/);
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await page.getByRole('textbox', { name: 'Buscar ruta, placa o chofer' }).fill('flores');
    await expect(page).toHaveURL(/buscar=flores/);
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Buscar ruta, placa o chofer' })).toHaveValue(
      'flores',
    );
    await expect(page.getByRole('tab', { name: 'En camino' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(table.locator('tbody tr')).toHaveCount(2);

    await page.getByLabel('Hasta').fill(dayFromToday(0));
    await expect(page).toHaveURL(new RegExp(`hasta=${dayFromToday(0)}`));
    await expect(page.getByText('No hay viajes con esos filtros.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Hasta')).toHaveValue(dayFromToday(0));
    await expect(page.getByText('No hay viajes con esos filtros.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('keeps the table scroll inside its card on a phone', async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'only meaningful on a phone');
    await open(page, baseURL, '/sucursal/viajes', { trips: [sampleTrip()] });

    await expect(page.getByRole('table', { name: 'Viajes' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
