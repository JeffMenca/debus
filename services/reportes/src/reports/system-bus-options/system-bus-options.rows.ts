import type { SystemBusOptionRow } from '@debus/contracts';

export interface BusOptionRecord {
  id: string;
  plate: string;
  brand: string;
  model: string;
  branch_name: string;
}
export interface BusOptionsTotalsRecord {
  buses: number;
}

export const toBusOptionRow = (record: BusOptionRecord): SystemBusOptionRow => ({
  id: record.id,
  plate: record.plate,
  brand: record.brand,
  model: record.model,
  branchName: record.branch_name,
});
