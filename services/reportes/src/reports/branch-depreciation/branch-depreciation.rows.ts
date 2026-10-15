import type { BranchDepreciationPage, BranchDepreciationRow } from '@debus/contracts';

export type DepreciationTotals = BranchDepreciationPage['summary']['totals'];

export interface DepreciationRecord {
  id: string;
  plate: string;
  brand: string;
  model: string;
  trips: number;
  km: number;
  accumulated: number;
}
export interface DepreciationTotalsRecord {
  buses: number;
  km: number;
  accumulated: number;
}
export interface CurrentRateRecord {
  depreciation_per_km: number;
}

// The amount of each trip was fixed with the rate of its day, so the bus shows the average over its km.
export const appliedPerKm = (accumulated: number, km: number): number | null =>
  km === 0 ? null : Math.round((accumulated / km) * 100) / 100;

export const toDepreciationRow = (record: DepreciationRecord): BranchDepreciationRow => ({
  busId: record.id,
  plate: record.plate,
  brand: record.brand,
  model: record.model,
  completedTrips: record.trips,
  kmTraveled: record.km,
  appliedPerKm: appliedPerKm(record.accumulated, record.km),
  accumulated: record.accumulated,
});

export const toCurrentPerKm = (records: CurrentRateRecord[]): number | null =>
  records[0]?.depreciation_per_km ?? null;

export const toDepreciationTotals = (
  record: DepreciationTotalsRecord | undefined,
  currentPerKm: number | null,
): DepreciationTotals => ({
  kmTraveled: record?.km ?? 0,
  accumulated: record?.accumulated ?? 0,
  currentPerKm,
});
