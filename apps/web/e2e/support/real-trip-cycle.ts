import { readFileSync } from 'node:fs';
import { type Page, expect } from '@playwright/test';
import { guatemalaAgo } from './guatemala-time';
import { queryLocal } from './local-sql';
import { ACTION_TIMEOUT } from './real-fleet';

// Steps of a trip, its repair and its files that the specs of reports follow through the pages of a
// branch, like a person would, so that reportes receives real events.

const CHECK = 'Revisé los datos: no se podrán cambiar';

export async function recordDeparture(branch: Page, plateTail: RegExp, day: string) {
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

export async function recordArrival(branch: Page, endMileageKm: string, fuelCost: string) {
  await expect(branch.getByLabel('Kilometraje final')).toBeVisible();
  await branch.getByLabel('Kilometraje final').fill(endMileageKm);
  await branch.getByLabel('Combustible total (Q)').fill(fuelCost);
  await branch.getByRole('button', { name: 'Registrar llegada' }).click();
  const dialog = branch.getByRole('alertdialog');
  await dialog.getByRole('checkbox', { name: CHECK }).click();
  await dialog.getByRole('button', { name: 'Sí, registrar llegada' }).click();
  await expect(dialog).toBeHidden();
  await expect(branch.getByText('Registrada, no editable')).toHaveCount(2);
}

// A repair of the bus with a tires line (Q 5,200) and an oil change line (Q 350.50).
export async function registerRepair(branch: Page, plateTail: RegExp) {
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

// The trip as reportes already knows it, so the sales published for it match the real trip.
export function tripOf(plate: string) {
  const [line] = queryLocal(
    'reportes',
    `SELECT id, route_id, branch_id, bus_id, origin_label, destination_label,
            to_char(departure_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            COALESCE(fuel_cost, 0), COALESCE(depreciation_amount, 0)
     FROM branch_report_trips WHERE bus_plate = '${plate}' AND deleted_at IS NULL`,
  );
  const [
    tripId,
    routeId,
    branchId,
    busId,
    originLabel,
    destinationLabel,
    departureAt,
    fuelCost,
    depreciationAmount,
  ] = line!.split('|');
  return {
    tripId: tripId!,
    routeId: routeId!,
    branchId: branchId!,
    busId: busId!,
    originLabel: originLabel!,
    destinationLabel: destinationLabel!,
    departureAt: departureAt!,
    fuelCost: Number(fuelCost),
    depreciationAmount: Number(depreciationAmount),
  };
}

// Downloads the PDF of the report on screen and checks its name and that it is a PDF.
export async function expectPdfDownload(page: Page, stem: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`^${stem}-\\d{4}-\\d{2}-\\d{2}\\.pdf$`));
  expect(
    readFileSync((await file.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
}
