import { TEST_BRANCH_PREFIX, TEST_RUN, testEmail } from '@debus/config/test-data';
import { type Browser, type Page, expect, test } from '@playwright/test';
import { cleanUpTestRun } from './support/clean-up';
import { ONE_PIXEL_PNG, dayFromToday } from './support/fleet-gateway';
import { isLocalStack } from './support/local-stack';
import { isReachable, latestLink, mailpitUrl } from './support/mailpit';
import { ADMIN_PASSWORD, signInAsRealAdmin } from './support/real-admin';
import { submitWhileRegistering } from './support/registering';

const randomLetters = (count: number) =>
  Array.from({ length: count }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('');

async function createBranch(page: Page, name: string, adminEmail: string) {
  await page.goto('/admin/sucursales/nueva');
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Código').fill(randomLetters(5));
  await page.getByRole('combobox', { name: 'Departamento' }).click();
  await page.getByRole('option', { name: 'Quetzaltenango' }).click();
  await page.getByLabel('Municipio').fill('Quetzaltenango');
  await page.getByLabel('Dirección').fill('4a calle 12-30 zona 1');
  await page.getByLabel('Teléfono').fill('77612233');
  await page.getByLabel('Latitud').fill('14.8347');
  await page.getByLabel('Longitud').fill('-91.5181');
  await page.getByLabel('Nombre completo').fill('Admin de Prueba');
  await page.getByLabel('Correo').fill(adminEmail);
  await page.getByRole('button', { name: 'Crear sucursal' }).click();
  await expect(page).toHaveURL(/\/admin\/sucursales$/);
}

// The invited admin follows the emailed link like a person would, then signs in to the branch.
async function signInAsBranchAdmin(
  browser: Browser,
  baseURL: string,
  inbox: string,
  email: string,
) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto(await latestLink(inbox, email, '/crear-contrasena'));
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByLabel('Repite tu contraseña').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page).toHaveURL(/\/login\?listo=1$/);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Ingresar/ }).click();
  await expect(page).toHaveURL(/\/sucursal$/);
  return { page, context };
}

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

    // Copies of branches, buses and drivers travel by events: the form is sent again only while the
    // service answers that one has not arrived, and never once the record is on screen.
    // Route to the other branch.
    await branch.goto('/sucursal/rutas');
    await branch.getByRole('button', { name: 'Nueva ruta' }).click();
    const routeDialog = branch.getByRole('dialog', { name: 'Nueva ruta' });
    await routeDialog.getByRole('combobox', { name: 'Destino' }).click();
    await branch.getByRole('option', { name: new RegExp(`destino ${stamp}`) }).click();
    await routeDialog.getByLabel('Distancia (km)').fill('214.3');
    await routeDialog.getByLabel('Precio del boleto (Q)').fill('70');
    await submitWhileRegistering({
      page: branch,
      path: '/api/flota/routes',
      submit: routeDialog.getByRole('button', { name: 'Crear ruta' }),
      saved: branch.getByRole('row', { name: new RegExp(`destino ${stamp}`) }),
    });
    await expect(branch.getByRole('row', { name: new RegExp(`destino ${stamp}`) })).toBeVisible();

    // Driver, with the licence valid long enough.
    await branch.goto('/sucursal/choferes');
    await branch.getByRole('button', { name: 'Registrar chofer' }).click();
    const driverSheet = branch.getByRole('dialog', { name: 'Registrar chofer' });
    await driverSheet.getByLabel('Foto del chofer').setInputFiles({
      name: 'chofer.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });
    await driverSheet.getByLabel('Nombre completo').fill('Chofer de Prueba');
    await driverSheet.getByLabel('Correo').fill(driverEmail);
    await driverSheet.getByLabel('Teléfono').fill('5559-8765');
    await driverSheet.getByLabel('Número de licencia').fill(license);
    await driverSheet.getByRole('combobox', { name: 'Tipo de licencia' }).click();
    await branch.getByRole('option', { name: 'Tipo A' }).click();
    await driverSheet.getByLabel('Vencimiento de la licencia').fill(dayFromToday(400));
    await driverSheet.getByLabel('Salario base por viaje (Q)').fill('175');
    await submitWhileRegistering({
      page: branch,
      path: '/api/flota/drivers',
      submit: driverSheet.getByRole('button', { name: 'Registrar chofer' }),
      saved: branch.getByRole('row', { name: /Chofer de Prueba/ }),
    });
    await expect(branch.getByRole('row', { name: /Chofer de Prueba/ })).toBeVisible();

    // Bus with a photo and that driver at the wheel.
    await branch.goto('/sucursal/buses');
    await branch.getByRole('button', { name: 'Registrar bus' }).click();
    const sheet = branch.getByRole('dialog', { name: 'Registrar bus' });
    await sheet.getByLabel('Foto del bus').setInputFiles({
      name: 'bus.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });
    await sheet.getByLabel('Placa').fill(plate);
    await sheet.getByLabel('Marca').fill('Volvo');
    await sheet.getByLabel('Modelo').fill('B8R');
    await sheet.getByLabel('Año').fill('2021');
    await sheet.getByLabel('Capacidad').fill('40');
    await sheet.getByLabel('Kilometraje').fill('1000');
    await sheet.getByRole('combobox', { name: 'Chofer de planta' }).click();
    await branch.getByRole('option', { name: 'Chofer de Prueba' }).click();
    await sheet.getByRole('button', { name: 'Registrar bus' }).click();
    const busRow = branch.getByRole('row', { name: new RegExp(plate.slice(-3)) });
    await expect(busRow).toBeVisible();
    await expect(busRow).toContainText('Chofer de Prueba');
    await expect(busRow.getByRole('img', { name: /Foto del bus/ })).toBeVisible();

    // The trip waits for the copies of the bus, the driver and the route to reach viajes.
    const tomorrow = dayFromToday(1);
    await branch.goto('/sucursal/viajes');
    await branch.getByRole('button', { name: 'Programar viaje' }).click();
    const tripDialog = branch.getByRole('dialog', { name: 'Programar viaje' });
    await tripDialog.getByRole('combobox', { name: 'Ruta' }).click();
    await branch.getByRole('option', { name: new RegExp(`destino ${stamp}`) }).click();
    await tripDialog.getByRole('combobox', { name: 'Bus' }).click();
    await branch.getByRole('option', { name: new RegExp(plate.slice(-3)) }).click();
    await tripDialog.getByLabel('Día de salida').fill(tomorrow);
    await tripDialog.getByLabel('Hora de salida').fill('05:30');
    await submitWhileRegistering({
      page: branch,
      path: '/api/viajes/trips',
      submit: tripDialog.getByRole('button', { name: 'Programar', exact: true }),
      saved: branch.getByRole('row', { name: new RegExp(plate.slice(-3)) }),
    });
    await expect(tripDialog).toBeHidden();

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
