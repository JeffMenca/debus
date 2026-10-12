import { expect, test, type Page } from '@playwright/test';
import { mockAdminGateway, sampleBranch } from './support/admin-gateway';
import {
  FLEET_BRANCH_ID,
  ONE_PIXEL_PNG,
  dayFromToday,
  manyBuses,
  mockFleetGateway,
  sampleBus,
  sampleDriver,
  sampleRoute,
} from './support/fleet-gateway';
import { expectNoHorizontalScroll, openMenuOnPhone, signInAs } from './support/session';

const GUATEMALA_ID = '5d1f3a20-2222-4d4d-9999-123456789abc';
const FLORES_ID = '6e2a4b31-3333-4e4e-8888-123456789abc';
const COBAN_ID = '7f3b5c42-4444-4f4f-9999-123456789abc';

const branches = [
  sampleBranch({ id: FLEET_BRANCH_ID }),
  sampleBranch({ id: GUATEMALA_ID, code: 'GUA', name: 'Guatemala', department: 'Guatemala' }),
  sampleBranch({ id: FLORES_ID, code: 'FLO', name: 'Flores', department: 'Petén' }),
  sampleBranch({ id: COBAN_ID, code: 'COB', name: 'Cobán', department: 'Alta Verapaz' }),
];
const destinations = branches.slice(1).map(({ id, name }) => ({ id, name }));

const julio = sampleDriver({ fullName: 'Julio Pérez', licenseNumber: 'A1234567' });
const ana = sampleDriver({
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  licenseNumber: 'B7654321',
  licenseExpiresOn: dayFromToday(10),
});
const marta = sampleDriver({
  fullName: 'Marta Coyoy',
  email: 'marta@correo.com',
  licenseNumber: 'C1111111',
});

const seed = () => ({
  destinations,
  drivers: [julio, ana, marta],
  buses: [
    sampleBus({
      plate: 'C482BTX',
      displayStatus: 'IN_TRANSIT',
      assignedDriverId: marta.id,
      assignedDriverName: marta.fullName,
    }),
    sampleBus({ plate: 'C731PLR', brand: 'Scania', model: 'K360', capacity: 44 }),
    sampleBus({
      plate: 'C340RTE',
      brand: 'Hino',
      model: 'AK8J',
      operationalStatus: 'IN_WORKSHOP',
      displayStatus: 'IN_WORKSHOP',
    }),
    sampleBus({ plate: 'C055DFG', active: false, displayStatus: 'INACTIVE' }),
  ],
  routes: [
    sampleRoute({ destinationBranchId: GUATEMALA_ID, destinationName: 'Guatemala' }),
    sampleRoute({
      destinationBranchId: FLORES_ID,
      destinationName: 'Flores',
      distanceKm: 560,
      ticketPrice: 150,
      hasTrips: true,
    }),
  ],
});

// A one pixel picture is enough: the double only checks that a file with an image type arrives.
const PICTURE = {
  name: 'bus.png',
  mimeType: 'image/png',
  buffer: ONE_PIXEL_PNG,
};

async function open(
  page: Page,
  baseURL: string | undefined,
  path: string,
  fleet: ReturnType<typeof seed> | Record<string, unknown> = seed(),
) {
  await mockAdminGateway(page, { branches });
  const gateway = await mockFleetGateway(page, fleet);
  await signInAs(page, baseURL!, 'BRANCH_ADMIN', FLEET_BRANCH_ID);
  await page.goto(path);
  return gateway;
}

test.describe('fleet', () => {
  test.skip(Boolean(process.env.E2E_REAL_API), 'runs only without a real gateway');

  test('is reached from the menu of the branch admin', async ({ page, baseURL }) => {
    await open(page, baseURL, '/sucursal');

    await openMenuOnPhone(page);
    await expect(page.getByRole('link', { name: 'Viajes', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Buses', exact: true }).click();
    await expect(page).toHaveURL(/\/sucursal\/buses$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Buses' })).toBeVisible();
    await expect(page.getByText('Flota · Quetzaltenango')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Choferes', exact: true }).click();
    await expect(page).toHaveURL(/\/sucursal\/choferes$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Choferes' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await openMenuOnPhone(page);
    await page.getByRole('link', { name: 'Rutas', exact: true }).click();
    await expect(page).toHaveURL(/\/sucursal\/rutas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Rutas' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('keeps the fleet screens away from a cashier', async ({ page, baseURL }) => {
    await mockAdminGateway(page, { branches });
    await mockFleetGateway(page, seed());
    await signInAs(page, baseURL!, 'CASHIER', FLEET_BRANCH_ID);

    await page.goto('/sucursal/buses');

    await expect(page).toHaveURL(/\/sucursal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Buses' })).toBeHidden();
  });

  test.describe('buses', () => {
    test('registers a bus with a photo and a plant driver', async ({ page, baseURL }) => {
      const gateway = await open(page, baseURL, '/sucursal/buses');
      // The numbers count up when they appear, so each is read once it has settled.
      const available = page
        .getByRole('region', { name: 'Resumen de la flota' })
        .getByText('Disponibles')
        .locator('xpath=preceding-sibling::span');
      await expect(available).toHaveText('1');

      await page.getByRole('button', { name: 'Registrar bus' }).click();
      const sheet = page.getByRole('dialog', { name: 'Registrar bus' });
      await sheet.getByLabel('Foto del bus').setInputFiles(PICTURE);
      await sheet.getByLabel('Placa').fill('p-123 abc');
      await sheet.getByLabel('Marca').fill('Mercedes');
      await sheet.getByLabel('Modelo').fill('OF-1721');
      await sheet.getByLabel('Año').fill('2019');
      await sheet.getByLabel('Capacidad').fill('36');
      await sheet.getByLabel('Kilometraje').fill('231905');
      await sheet.getByRole('combobox', { name: 'Chofer de planta' }).click();
      await page.getByRole('option', { name: 'Julio Pérez' }).click();
      await expectNoHorizontalScroll(page);
      await sheet.getByRole('button', { name: 'Registrar bus' }).click();

      await expect(page.getByText('Registramos el bus P-123ABC.')).toBeVisible();
      const row = page.getByRole('row', { name: /P-123ABC/ });
      await expect(row).toContainText('Mercedes OF-1721');
      await expect(row).toContainText('Julio Pérez');
      await expect(row).toContainText('Disponible');
      await expect(row.getByRole('img', { name: 'Foto del bus P-123ABC' })).toBeVisible();
      await expect(available).toHaveText('2');
      expect(
        gateway.requests.find((r) => r.method === 'POST' && r.path === '/buses')?.body,
      ).toMatchObject({ plate: 'P123ABC', assignedDriverId: julio.id });
      expect(gateway.requests.some((r) => r.method === 'PUT' && r.path.endsWith('/photo'))).toBe(
        true,
      );
      await expectNoHorizontalScroll(page);
    });

    test('shows a repeated plate next to the plate field', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/buses');

      await page.getByRole('button', { name: 'Registrar bus' }).click();
      const sheet = page.getByRole('dialog', { name: 'Registrar bus' });
      await sheet.getByLabel('Placa').fill('C-482BTX');
      await sheet.getByLabel('Marca').fill('Volvo');
      await sheet.getByLabel('Modelo').fill('B8R');
      await sheet.getByLabel('Año').fill('2021');
      await sheet.getByLabel('Capacidad').fill('40');
      await sheet.getByLabel('Kilometraje').fill('100');
      await sheet.getByRole('button', { name: 'Registrar bus' }).click();

      await expect(sheet.locator('#bus-plate-error')).toHaveText('Ya existe un bus con esa placa.');
      await expect(sheet.getByLabel('Placa')).toHaveAttribute('aria-invalid', 'true');
    });

    test('sends a bus to the workshop and finds it on that tab', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/buses');

      await page.getByRole('button', { name: 'Acciones de C-731PLR' }).click();
      await page.getByRole('menuitem', { name: 'Mandar a taller' }).click();
      await expect(page.getByText('El bus C-731PLR está en taller.')).toBeVisible();

      await page.getByRole('tab', { name: /En taller/ }).click();
      await expect(page).toHaveURL(/estado=en-taller/);
      await expect(page.getByRole('row', { name: /C-731PLR/ })).toContainText('En taller');
      await expect(page.getByRole('row', { name: /C-340RTE/ })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test('explains why a bus with trips cannot be deactivated', async ({ page, baseURL }) => {
      const fleet = seed();
      await open(page, baseURL, '/sucursal/buses', {
        ...fleet,
        busyBusIds: [fleet.buses[1].id],
      });

      await page.getByRole('button', { name: 'Acciones de C-731PLR' }).click();
      await page.getByRole('menuitem', { name: 'Desactivar' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();

      await expect(page.getByRole('alertdialog')).toContainText(
        'tiene viajes programados o en camino',
      );
      await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('row', { name: /C-731PLR/ })).toContainText('Disponible');
    });

    test('deactivates a free bus and reactivates it', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/buses');

      await page.getByRole('button', { name: 'Acciones de C-731PLR' }).click();
      await page.getByRole('menuitem', { name: 'Desactivar' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();
      await expect(page.getByRole('row', { name: /C-731PLR/ })).toContainText('Inactivo');

      await page.getByRole('button', { name: 'Acciones de C-731PLR' }).click();
      await page.getByRole('menuitem', { name: 'Reactivar' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Reactivar' }).click();
      await expect(page.getByRole('row', { name: /C-731PLR/ })).toContainText('Disponible');
    });

    test('pages 45 buses and keeps page, tab and search in the address after a reload', async ({
      page,
      baseURL,
    }) => {
      await open(page, baseURL, '/sucursal/buses', { buses: manyBuses(45) });

      const table = page.getByRole('table', { name: 'Buses' });
      await expect(table.locator('tbody tr')).toHaveCount(20);
      await expect(page.getByText('Mostrando 1–20 de 45')).toBeVisible();
      const next = page.getByRole('button', { name: 'Página siguiente' });
      await next.scrollIntoViewIfNeeded();
      await next.click();
      await expect(page).toHaveURL(/pagina=2/);
      await page.reload();
      await expect(page.getByText('Mostrando 21–40 de 45')).toBeVisible();

      await page.getByRole('tab', { name: /Disponibles/ }).click();
      await expect(page).toHaveURL(/estado=disponibles/);
      await expect(page).not.toHaveURL(/pagina=/);
      await page.getByRole('textbox', { name: 'Buscar bus' }).fill('modelo 04');
      await expect(page).toHaveURL(/buscar=modelo/);
      await expect(table.locator('tbody tr')).toHaveCount(6);
      await page.reload();
      await expect(page.getByRole('textbox', { name: 'Buscar bus' })).toHaveValue('modelo 04');
      await expect(page.getByRole('tab', { name: /Disponibles/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(table.locator('tbody tr')).toHaveCount(6);
      await expectNoHorizontalScroll(page);
    });

    test('keeps the table scroll inside its card', async ({ page, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'only meaningful on a phone');
      await open(page, baseURL, '/sucursal/buses');

      await expect(page.getByRole('table', { name: 'Buses' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe('drivers', () => {
    test('registers a driver whose expiry starts today and sees the licence about to expire', async ({
      page,
      baseURL,
    }) => {
      const gateway = await open(page, baseURL, '/sucursal/choferes');
      await expect(page.getByText('Vence en 10 días')).toBeVisible();
      await expect(page.getByText('Vence en 10 días')).toHaveClass(/bg-coral-100/);

      await page.getByRole('button', { name: 'Registrar chofer' }).click();
      const sheet = page.getByRole('dialog', { name: 'Registrar chofer' });
      await expect(sheet.getByLabel('Vencimiento de la licencia')).toHaveValue(dayFromToday(0));
      await sheet.getByLabel('Nombre completo').fill('Edgar Tzul');
      await sheet.getByLabel('Correo').fill('Edgar@Correo.com');
      await sheet.getByLabel('Teléfono').fill('5559-8765');
      await sheet.getByLabel('Número de licencia').fill('d 998-8776');
      await sheet.getByRole('combobox', { name: 'Tipo de licencia' }).click();
      await page.getByRole('option', { name: 'Tipo B' }).click();
      await sheet.getByLabel('Vencimiento de la licencia').fill(dayFromToday(200));
      await sheet.getByLabel('Salario base por viaje (Q)').fill('175.5');
      await expectNoHorizontalScroll(page);
      await sheet.getByRole('button', { name: 'Registrar chofer' }).click();

      await expect(
        page.getByText('Registramos a Edgar Tzul. Le enviamos un correo para crear su contraseña.'),
      ).toBeVisible();
      const row = page.getByRole('row', { name: /Edgar Tzul/ });
      await expect(row).toContainText('edgar@correo.com');
      await expect(row).toContainText('D9988776');
      await expect(row).toContainText('5559-8765');
      expect(
        gateway.requests.find((r) => r.method === 'POST' && r.path === '/drivers')?.body,
      ).toMatchObject({ email: 'edgar@correo.com', phone: '55598765', baseSalary: 175.5 });
      await expectNoHorizontalScroll(page);
    });

    test('marks the licence and the email that are already taken', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/choferes');

      await page.getByRole('button', { name: 'Registrar chofer' }).click();
      const sheet = page.getByRole('dialog', { name: 'Registrar chofer' });
      await sheet.getByLabel('Nombre completo').fill('Otro Chofer');
      await sheet.getByLabel('Correo').fill('otro@correo.com');
      await sheet.getByLabel('Teléfono').fill('55511111');
      await sheet.getByLabel('Número de licencia').fill('A1234567');
      await sheet.getByRole('combobox', { name: 'Tipo de licencia' }).click();
      await page.getByRole('option', { name: 'Tipo C' }).click();
      await sheet.getByLabel('Salario base por viaje (Q)').fill('150');
      await sheet.getByRole('button', { name: 'Registrar chofer' }).click();
      await expect(sheet.locator('#driver-license-error')).toHaveText(
        'Ya existe un chofer con ese número de licencia.',
      );

      await sheet.getByLabel('Número de licencia').fill('Z9999999');
      await sheet.getByLabel('Correo').fill('julio@correo.com');
      await sheet.getByRole('button', { name: 'Registrar chofer' }).click();
      await expect(sheet.locator('#driver-email-error')).toHaveText(
        'Ya existe un chofer con ese correo.',
      );
    });

    test('explains why a driver with trips cannot be deactivated', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/choferes', { ...seed(), busyDriverIds: [julio.id] });

      await page.getByRole('button', { name: 'Acciones de Julio Pérez' }).click();
      await page.getByRole('menuitem', { name: 'Desactivar' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();

      await expect(page.getByRole('alertdialog')).toContainText('tiene viajes programados');
    });

    test('deactivates a driver, who moves to the inactive tab', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/choferes');

      await page.getByRole('button', { name: 'Acciones de Ana Sic' }).click();
      await page.getByRole('menuitem', { name: 'Desactivar' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }).click();
      await expect(page.getByRole('row', { name: /Ana Sic/ })).toBeHidden();

      await page.getByRole('tab', { name: /Inactivos/ }).click();
      await expect(page).toHaveURL(/estado=inactivos/);
      await expect(page.getByRole('row', { name: /Ana Sic/ })).toContainText('Inactivo');
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe('routes', () => {
    test('creates, edits, retires and deletes a route', async ({ page, baseURL }) => {
      const gateway = await open(page, baseURL, '/sucursal/rutas');
      await expect(page.getByRole('row', { name: /Guatemala/ })).toContainText('206.5 km');

      await page.getByRole('button', { name: 'Nueva ruta' }).click();
      const dialog = page.getByRole('dialog', { name: 'Nueva ruta' });
      await dialog.getByRole('combobox', { name: 'Destino' }).click();
      await expect(page.getByRole('option', { name: 'Quetzaltenango' })).toHaveCount(0);
      await page.getByRole('option', { name: 'Cobán' }).click();
      await dialog.getByLabel('Distancia (km)').fill('214.3');
      await dialog.getByLabel('Precio del boleto (Q)').fill('70');
      await dialog.getByRole('button', { name: 'Crear ruta' }).click();
      const row = page.getByRole('row', { name: /Cobán/ });
      await expect(row).toContainText('214.3 km');
      expect(
        gateway.requests.find((r) => r.method === 'POST' && r.path === '/routes')?.body,
      ).toEqual({ destinationBranchId: COBAN_ID, distanceKm: 214.3, ticketPrice: 70 });

      await page.getByRole('button', { name: 'Acciones de Quetzaltenango a Cobán' }).click();
      await page.getByRole('menuitem', { name: 'Editar' }).click();
      const edit = page.getByRole('dialog', { name: 'Editar ruta a Cobán' });
      await edit.getByLabel('Precio del boleto (Q)').fill('75');
      await edit.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(row).toContainText(/Q\s?75\.00/);

      await page.getByRole('button', { name: 'Acciones de Quetzaltenango a Cobán' }).click();
      await page.getByRole('menuitem', { name: 'Retirar' }).click();
      await expect(page.getByRole('row', { name: /Cobán/ })).toBeHidden();
      await page.getByRole('tab', { name: /Retiradas/ }).click();
      await expect(page.getByRole('row', { name: /Cobán/ })).toContainText('Retirada');

      await page.getByRole('button', { name: 'Acciones de Quetzaltenango a Cobán' }).click();
      await page.getByRole('menuitem', { name: 'Eliminar' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('¿Eliminar la ruta a Cobán?');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByRole('row', { name: /Cobán/ })).toBeHidden();
      await expectNoHorizontalScroll(page);
    });

    test('does not offer to delete a route that has trips', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/rutas');

      await page.getByRole('button', { name: 'Acciones de Quetzaltenango a Flores' }).click();
      await expect(page.getByRole('menuitem', { name: 'Retirar' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Eliminar' })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Tiene viajes: puedes retirarla' }).focus();
      await expect(page.getByRole('tooltip')).toContainText('Tiene viajes: puedes retirarla');
    });

    test('shows a repeated route next to the destination', async ({ page, baseURL }) => {
      await open(page, baseURL, '/sucursal/rutas');

      await page.getByRole('button', { name: 'Nueva ruta' }).click();
      const dialog = page.getByRole('dialog', { name: 'Nueva ruta' });
      await dialog.getByRole('combobox', { name: 'Destino' }).click();
      await page.getByRole('option', { name: 'Guatemala' }).click();
      await dialog.getByLabel('Distancia (km)').fill('206.5');
      await dialog.getByLabel('Precio del boleto (Q)').fill('85');
      await dialog.getByRole('button', { name: 'Crear ruta' }).click();

      await expect(dialog.locator('#route-destination-error')).toContainText(
        'Ya existe una ruta hacia esa sucursal',
      );
    });
  });
});
