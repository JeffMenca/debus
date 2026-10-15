import type { BranchDriverRow, BranchDriversPage } from '@debus/contracts';

export type DriverTotals = BranchDriversPage['summary']['totals'];

export interface DriverRecord {
  id: string;
  full_name: string;
  license_number: string;
  license_type: BranchDriverRow['licenseType'];
  license_expires_on: Date;
  active: boolean;
  completed_trips: number;
}
export interface DriverTotalsRecord {
  drivers: number;
  completed_trips: number;
}
export interface ActiveCountRecord {
  active: boolean;
  drivers: number;
}

export const toDriverRow = (record: DriverRecord): BranchDriverRow => ({
  driverId: record.id,
  licenseNumber: record.license_number,
  fullName: record.full_name,
  licenseType: record.license_type,
  licenseExpiresOn: record.license_expires_on.toISOString().slice(0, 10),
  active: record.active,
  completedTrips: record.completed_trips,
});

export const toDriverTotals = (record?: DriverTotalsRecord): DriverTotals => ({
  drivers: record?.drivers ?? 0,
  completedTrips: record?.completed_trips ?? 0,
});

// Both states are always listed, so the tabs do not move when one has no drivers.
export const toDriverGroups = (records: ActiveCountRecord[]) =>
  [true, false].map((active) => ({
    active,
    drivers: records.find((record) => record.active === active)?.drivers ?? 0,
  }));
