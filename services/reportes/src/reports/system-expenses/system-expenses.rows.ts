import type { ExpenseConcept, SystemExpenseRow, SystemExpensesPage } from '@debus/contracts';

export type ExpenseTotals = SystemExpensesPage['summary']['totals'];
export type ExpenseGroup = SystemExpensesPage['summary']['groups'][number];

export interface ExpenseRecord {
  id: string;
  branch_id: string;
  branch_name: string;
  concept: string;
  // A DATE column reaches us as midnight UTC of that day.
  day: Date;
  bus_plate: string | null;
  origin_label: string | null;
  destination_label: string | null;
  category_name: string | null;
  description: string | null;
  amount: number;
}
export type ExpenseTotalsRecord = ExpenseTotals;

export const EXPENSE_CONCEPT_LABELS: Record<ExpenseConcept, string> = {
  FUEL: 'Combustible',
  DEPRECIATION: 'Depreciación',
  LABOR: 'Mano de obra',
  PART: 'Repuestos',
};

export const toExpenseRow = (record: ExpenseRecord): SystemExpenseRow => ({
  id: record.id,
  branchId: record.branch_id,
  branchName: record.branch_name,
  concept: record.concept as ExpenseConcept,
  day: record.day.toISOString().slice(0, 10),
  busPlate: record.bus_plate,
  originLabel: record.origin_label,
  destinationLabel: record.destination_label,
  categoryName: record.category_name,
  description: record.description,
  amount: record.amount,
});

// A trip is told by its route and a repair line by its category and what was done; the en dash
// exists in the standard PDF font, the web screen draws its own arrow.
export function expenseDetail(row: SystemExpenseRow): string {
  if (row.originLabel && row.destinationLabel)
    return `${row.originLabel} – ${row.destinationLabel}`;
  if (row.categoryName) return `${row.categoryName}: ${row.description ?? ''}`.trimEnd();
  return '';
}

export const toExpenseTotals = (record: ExpenseTotalsRecord | undefined): ExpenseTotals => ({
  entries: record?.entries ?? 0,
  amount: record?.amount ?? 0,
  fuel: record?.fuel ?? 0,
  depreciation: record?.depreciation ?? 0,
  labor: record?.labor ?? 0,
  parts: record?.parts ?? 0,
});
