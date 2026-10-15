import {
  BUS_DISPLAY_STATUSES,
  type BranchBusRow,
  type BranchBusesPage,
  type BusDisplayStatus,
} from '@debus/contracts';

export type BusTotals = BranchBusesPage['summary']['totals'];

export interface BusRecord {
  id: string;
  plate: string;
  brand: string;
  model: string;
  capacity: number;
  mileage_km: number;
  driver_name: string | null;
  completed_trips: number;
  last_mileage_km: number | null;
  status: BusDisplayStatus;
}
export interface BusTotalsRecord {
  buses: number;
  completed_trips: number;
}
export interface StatusCountRecord {
  status: BusDisplayStatus;
  buses: number;
}

// The bus copy only moves with fleet events; a completed trip can be ahead of it.
export const currentMileage = (copyKm: number, lastArrivalKm: number | null): number =>
  Math.max(copyKm, lastArrivalKm ?? 0);

export const toBusRow = (record: BusRecord): BranchBusRow => ({
  busId: record.id,
  plate: record.plate,
  brand: record.brand,
  model: record.model,
  capacity: record.capacity,
  status: record.status,
  driverName: record.driver_name,
  mileageKm: currentMileage(record.mileage_km, record.last_mileage_km),
  completedTrips: record.completed_trips,
});

export const toBusTotals = (record?: BusTotalsRecord): BusTotals => ({
  buses: record?.buses ?? 0,
  completedTrips: record?.completed_trips ?? 0,
});

// Every status is listed, in display order, so the tabs do not move when one has no buses.
export const toStatusGroups = (records: StatusCountRecord[]) =>
  BUS_DISPLAY_STATUSES.map((status) => ({
    status,
    buses: records.find((record) => record.status === status)?.buses ?? 0,
  }));
