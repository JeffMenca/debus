import { expect, test, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import {
  FLEET_BRANCH_ID,
  dayFromToday,
  mockFleetGateway,
  sampleBus,
  sampleDriver,
  sampleRoute,
} from './support/fleet-gateway';
import { type TripsSeed, instantAt, mockTripsGateway, sampleTrip } from './support/trips-gateway';
import { expectNoHorizontalScroll, signInAs } from './support/session';

const GUATEMALA_ID = '5d1f3a20-2222-4d4d-9999-123456789abc';

const julio = sampleDriver({
  fullName: 'Julio Pérez',
  licenseNumber: 'A1234567',
  licenseType: 'C',
  licenseExpiresOn: dayFromToday(25),
});
const ana = sampleDriver({
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  licenseNumber: 'B7654321',
  licenseType: 'B',
  licenseExpiresOn: dayFromToday(10),
});
const marta = sampleDriver({
  fullName: 'Marta Coyoy',
  email: 'marta@correo.com',
  licenseNumber: 'C1111111',
});
const volvo = sampleBus({ plate: 'C482BTX' });

const HOUR_MS = 3_600_000;

async function open(
  page: Page,
  baseURL: string | undefined,
  trips: TripsSeed = {},
  role = 'BRANCH_ADMIN',
) {
  await mockAdminGateway(page, { branches: [sampleBranch({ id: FLEET_BRANCH_ID })] });
  const fleet = await mockFleetGateway(page, {
    drivers: [julio, ana, marta],
    buses: [volvo],
    routes: [sampleRoute({ destinationBranchId: GUATEMALA_ID, destinationName: 'Guatemala' })],
  });
  await mockTripsGateway(page, fleet, trips);
  await signInAs(page, baseURL!, role, FLEET_BRANCH_ID);
  await page.goto('/sucursal');
}

const departures = [
  sampleTrip({ departureAt: instantAt(0, '22:00'), estimatedArrivalAt: instantAt(0, '23:30') }),
  sampleTrip({
    busPlate: 'C731PLR',
    driverName: 'Ana Sic',
    destinationName: 'Flores',
    departureAt: instantAt(0, '23:00'),
    estimatedArrivalAt: instantAt(1, '08:00'),
  }),
  sampleTrip({
    busPlate: 'C340RTE',
    driverName: 'Marta Coyoy',
    destinationName: 'Cobán',
    departureAt: instantAt(1, '07:15'),
    estimatedArrivalAt: instantAt(1, '12:00'),
  }),
];

// A bus that left two hours ago and is expected in three.
const onTheRoad = () =>
  sampleTrip({
    status: 'IN_TRANSIT',
    busPlate: 'C208MNA',
    destinationName: 'Huehuetenango',
    departureAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    estimatedArrivalAt: new Date(Date.now() + 3 * HOUR_MS).toISOString(),
  });

// The numbers count up when they appear, so each is read once it has settled.
const counter = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).locator('xpath=preceding-sibling::span');

test.describe('branch dashboard', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('greets the admin and counts the departures and the licences about to expire', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, { trips: departures });

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^(Buenos días|Buenas tardes|Buenas noches), Marta$/,
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Día')).toHaveValue(dayFromToday(0));
    await expect(counter(page, 'Salidas programadas hoy')).toHaveText('2');
    await expect(counter(page, 'Licencias por vencer')).toHaveText('2');

    const upcoming = page.getByRole('table', { name: 'Próximas salidas' });
    await expect(upcoming.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('row', { name: /Flores/ })).toContainText('23:00');
    await expect(page.getByRole('row', { name: /Flores/ })).toContainText('Ana Sic');

    const licences = page.getByRole('listitem', { name: 'Ana Sic' });
    await expect(licences).toContainText('10');
    await expect(licences).toContainText('Licencia B');
    await expect(licences).toHaveClass(/bg-coral-100/);
    await expect(page.getByRole('listitem', { name: 'Julio Pérez' })).toHaveClass(/bg-mango-100/);
    await expect(page.getByRole('listitem', { name: 'Marta Coyoy' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test('shows the departures of the day that is picked', async ({ page, baseURL }) => {
    await open(page, baseURL, { trips: departures });
    await expect(page.getByRole('table', { name: 'Próximas salidas' })).toBeVisible();

    await page.getByLabel('Día').fill(dayFromToday(1));

    const upcoming = page.getByRole('table', { name: 'Próximas salidas' });
    await expect(upcoming.locator('tbody tr')).toHaveCount(1);
    await expect(upcoming).toContainText('Cobán');
    await expect(upcoming).toContainText('07:15');
    await expect(counter(page, 'Salidas programadas ese día')).toHaveText('1');
    await expect(page.getByRole('link', { name: 'Ver todos los viajes' })).toHaveAttribute(
      'href',
      `/sucursal/viajes?desde=${dayFromToday(1)}&hasta=${dayFromToday(1)}`,
    );
    await expectNoHorizontalScroll(page);
  });

  test('opens the schedule dialog on the day that is shown', async ({ page, baseURL }) => {
    await open(page, baseURL);
    await page.getByLabel('Día').fill(dayFromToday(2));

    await page.getByRole('button', { name: 'Programar viaje' }).click();

    const dialog = page.getByRole('dialog', { name: 'Programar viaje' });
    await expect(dialog.getByLabel('Día de salida')).toHaveValue(dayFromToday(2));
    await expectNoHorizontalScroll(page);
  });

  test('promises to show a bus when it leaves while none is on the road', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL);

    await expect(page.getByText('Cuando un bus salga, lo verás aquí.')).toBeVisible();
    await expect(page.getByText('No hay salidas programadas para este día.')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('shows the buses that are on the road with how far along they are', async ({
    page,
    baseURL,
  }) => {
    await open(page, baseURL, { trips: [onTheRoad()] });

    const lane = page.getByRole('listitem', { name: /Huehuetenango/ });
    await expect(lane).toContainText('C-208MNA');
    await expect(lane.getByRole('progressbar', { name: 'Avance de C-208MNA' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    await expectNoHorizontalScroll(page);
  });

  test('keeps the welcome for a cashier', async ({ page, baseURL }) => {
    await open(page, baseURL, {}, 'CASHIER');

    await expect(page.getByRole('heading', { level: 1, name: 'Hola, Marta Ruiz' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Programar viaje' })).toHaveCount(0);
  });
});
