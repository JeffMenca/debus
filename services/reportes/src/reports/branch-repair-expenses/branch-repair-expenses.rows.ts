import type {
  BranchRepairExpenseRow,
  BranchRepairExpensesPage,
  RepairCategoryShare,
} from '@debus/contracts';

export type RepairTotals = BranchRepairExpensesPage['summary']['totals'];

export interface RepairBusRecord {
  id: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  expenses: number;
  total: number;
}
export interface RepairCategoryRecord {
  bus_id: string;
  category_id: string;
  category_name: string;
  lines: number;
  amount: number;
}
export type RepairGroupRecord = Omit<RepairCategoryRecord, 'bus_id'>;
export type RepairTotalsRecord = RepairTotals;
export interface FilterLabelsRecord {
  bus_plate: string | null;
  category_name: string | null;
}

const toShare = (record: RepairGroupRecord): RepairCategoryShare => ({
  categoryId: record.category_id,
  categoryName: record.category_name,
  lines: record.lines,
  amount: record.amount,
});

// The biggest spending first; equal amounts read in alphabetical order.
const bySpending = (a: RepairCategoryShare, b: RepairCategoryShare): number =>
  b.amount - a.amount || a.categoryName.localeCompare(b.categoryName, 'es');

export function nestCategories(
  buses: RepairBusRecord[],
  categories: RepairCategoryRecord[],
): BranchRepairExpenseRow[] {
  const byBus = new Map<string, RepairCategoryShare[]>();
  for (const record of categories) {
    const shares = byBus.get(record.bus_id) ?? [];
    shares.push(toShare(record));
    byBus.set(record.bus_id, shares);
  }
  return buses.map((bus) => ({
    busId: bus.id,
    plate: bus.plate,
    brand: bus.brand,
    model: bus.model,
    expenses: bus.expenses,
    total: bus.total,
    categories: (byBus.get(bus.id) ?? []).sort(bySpending),
  }));
}

export const toRepairGroups = (records: RepairGroupRecord[]): RepairCategoryShare[] =>
  records.map(toShare);

export const toRepairTotals = (record: RepairTotalsRecord | undefined): RepairTotals => ({
  buses: record?.buses ?? 0,
  expenses: record?.expenses ?? 0,
  total: record?.total ?? 0,
});
