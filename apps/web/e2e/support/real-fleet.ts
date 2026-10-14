import { type Browser, type Page, expect } from '@playwright/test';
import { ONE_PIXEL_PNG, dayFromToday } from './fleet-gateway';
import { latestLink } from './mailpit';
import { ADMIN_PASSWORD } from './real-admin';
import { submitWhileRegistering } from './registering';

// Setup steps of the specs that run against the local stack: they follow the pages like a person
// would, so the services and the events between them are part of what the spec proves.

export const randomLetters = (count: number) =>
  Array.from({ length: count }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('');

export async function createBranch(page: Page, name: string, adminEmail: string) {
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
export async function signInAsBranchAdmin(
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

// Copies of branches, buses and drivers travel by events: each form is sent again only while the
// service answers that one has not arrived, and never once the record is on screen.
export async function createRoute(branch: Page, destination: string, distanceKm = '214.3') {
  await branch.goto('/sucursal/rutas');
  await branch.getByRole('button', { name: 'Nueva ruta' }).click();
  const dialog = branch.getByRole('dialog', { name: 'Nueva ruta' });
  await dialog.getByRole('combobox', { name: 'Destino' }).click();
  await branch.getByRole('option', { name: new RegExp(destination) }).click();
  await dialog.getByLabel('Distancia (km)').fill(distanceKm);
  await dialog.getByLabel('Precio del boleto (Q)').fill('70');
  await submitWhileRegistering({
    page: branch,
    path: '/api/flota/routes',
    submit: dialog.getByRole('button', { name: 'Crear ruta' }),
    saved: branch.getByRole('row', { name: new RegExp(destination) }),
  });
  await expect(branch.getByRole('row', { name: new RegExp(destination) })).toBeVisible();
}

export async function registerDriver(
  branch: Page,
  driver: { name: string; email: string; license: string; salary: string },
) {
  await branch.goto('/sucursal/choferes');
  await branch.getByRole('button', { name: 'Registrar chofer' }).click();
  const sheet = branch.getByRole('dialog', { name: 'Registrar chofer' });
  await sheet.getByLabel('Foto del chofer').setInputFiles({
    name: 'chofer.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await sheet.getByLabel('Nombre completo').fill(driver.name);
  await sheet.getByLabel('Correo').fill(driver.email);
  await sheet.getByLabel('Teléfono').fill('5559-8765');
  await sheet.getByLabel('Número de licencia').fill(driver.license);
  await sheet.getByRole('combobox', { name: 'Tipo de licencia' }).click();
  await branch.getByRole('option', { name: 'Tipo A' }).click();
  await sheet.getByLabel('Vencimiento de la licencia').fill(dayFromToday(400));
  await sheet.getByLabel('Salario base por viaje (Q)').fill(driver.salary);
  await submitWhileRegistering({
    page: branch,
    path: '/api/flota/drivers',
    submit: sheet.getByRole('button', { name: 'Registrar chofer' }),
    saved: branch.getByRole('row', { name: new RegExp(driver.name) }),
  });
  await expect(branch.getByRole('row', { name: new RegExp(driver.name) })).toBeVisible();
}

// A bus with a photo and the given driver at the wheel; returns its row.
export async function registerBus(
  branch: Page,
  bus: { plate: string; driverName: string; mileageKm: string },
) {
  await branch.goto('/sucursal/buses');
  await branch.getByRole('button', { name: 'Registrar bus' }).click();
  const sheet = branch.getByRole('dialog', { name: 'Registrar bus' });
  await sheet.getByLabel('Foto del bus').setInputFiles({
    name: 'bus.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await sheet.getByLabel('Placa').fill(bus.plate);
  await sheet.getByLabel('Marca').fill('Volvo');
  await sheet.getByLabel('Modelo').fill('B8R');
  await sheet.getByLabel('Año').fill('2021');
  await sheet.getByLabel('Capacidad').fill('40');
  await sheet.getByLabel('Kilometraje').fill(bus.mileageKm);
  await sheet.getByRole('combobox', { name: 'Chofer de planta' }).click();
  await branch.getByRole('option', { name: bus.driverName }).click();
  await sheet.getByRole('button', { name: 'Registrar bus' }).click();
  const row = branch.getByRole('row', { name: new RegExp(bus.plate.slice(-3)) });
  await expect(row).toBeVisible();
  return row;
}

// The trip waits for the copies of the bus, the driver and the route to reach viajes.
export async function scheduleTrip(
  branch: Page,
  trip: { destination: string; plate: string; day: string; time: string },
) {
  await branch.goto('/sucursal/viajes');
  await branch.getByRole('button', { name: 'Programar viaje' }).click();
  const dialog = branch.getByRole('dialog', { name: 'Programar viaje' });
  await dialog.getByRole('combobox', { name: 'Ruta' }).click();
  await branch.getByRole('option', { name: new RegExp(trip.destination) }).click();
  await dialog.getByRole('combobox', { name: 'Bus' }).click();
  await branch.getByRole('option', { name: new RegExp(trip.plate.slice(-3)) }).click();
  await dialog.getByLabel('Día de salida').fill(trip.day);
  await dialog.getByLabel('Hora de salida').fill(trip.time);
  await submitWhileRegistering({
    page: branch,
    path: '/api/viajes/trips',
    submit: dialog.getByRole('button', { name: 'Programar', exact: true }),
    saved: branch.getByRole('row', { name: new RegExp(trip.plate.slice(-3)) }),
  });
  await expect(dialog).toBeHidden();
}
