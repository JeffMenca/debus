import type { SystemRepairExpenseRow, SystemRepairExpensesPage } from '@debus/contracts';

export type RepairTotals = SystemRepairExpensesPage['summary']['totals'];
export type RepairCategory = SystemRepairExpensesPage['summary']['groups'][number];

export interface RepairLineRecord {
  expense_id: string;
  line_no: number;
  category_id: string;
  category_name: string;
  bus_id: string;
  bus_plate: string | null;
  branch_id: string;
  branch_name: string;
  // A DATE column reaches us as midnight UTC of that day.
  service_date: Date;
  kind: string;
  description: string;
  amount: number;
}
export interface RepairCategoryRecord {
  category_id: string;
  category_name: string;
  lines: number;
  amount: number;
}
export type RepairTotalsRecord = RepairTotals;
export interface BusPlateRecord {
  plate: string;
}

export const REPAIR_KIND_LABELS: Record<SystemRepairExpenseRow['kind'], string> = {
  LABOR: 'Mano de obra',
  PART: 'Repuestos',
};

export const toRepairRow = (record: RepairLineRecord): SystemRepairExpenseRow => ({
  expenseId: record.expense_id,
  lineNo: record.line_no,
  categoryId: record.category_id,
  categoryName: record.category_name,
  busId: record.bus_id,
  busPlate: record.bus_plate,
  branchId: record.branch_id,
  branchName: record.branch_name,
  serviceDate: record.service_date.toISOString().slice(0, 10),
  kind: record.kind as SystemRepairExpenseRow['kind'],
  description: record.description,
  amount: record.amount,
});

export const toCategoryGroups = (records: RepairCategoryRecord[]): RepairCategory[] =>
  records.map((record) => ({
    categoryId: record.category_id,
    categoryName: record.category_name,
    lines: record.lines,
    amount: record.amount,
  }));

export const toRepairTotals = (record: RepairTotalsRecord | undefined): RepairTotals => ({
  lines: record?.lines ?? 0,
  expenses: record?.expenses ?? 0,
  amount: record?.amount ?? 0,
});
