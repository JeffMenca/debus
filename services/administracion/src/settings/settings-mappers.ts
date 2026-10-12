import type { SettingsUpdatedPayload, SettingsVersion } from '@debus/contracts';
import type { SettingsVersion as SettingsRow } from '../generated/prisma/client';

// A DATE column comes back as midnight UTC; reading and writing in UTC keeps the same day.
export const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);
export const fromDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

function fields(row: SettingsRow) {
  return {
    depreciationPerKm: row.depreciationPerKm.toNumber(),
    rentalRatePerKm: row.rentalRatePerKm.toNumber(),
    effectiveFrom: toDateOnly(row.effectiveFrom),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSettingsVersion(row: SettingsRow, createdByName: string | null): SettingsVersion {
  return { id: row.id, ...fields(row), createdByName };
}

export function toSettingsPayload(row: SettingsRow): SettingsUpdatedPayload {
  return { versionId: row.id, ...fields(row) };
}
