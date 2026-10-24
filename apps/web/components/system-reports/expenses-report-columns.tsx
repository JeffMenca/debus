'use client';

import type { SystemBranchGroup, SystemExpenseRow, SystemExpensesPage } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { formatQuetzales, formatShortDate } from '@/lib/format';
import type { GroupedRow } from '@/lib/system-reports/grouped-rows';
import { EXPENSE_CONCEPT_LABELS } from '@/lib/system-reports/labels';
import {
  amountCell,
  busPlateCell,
  groupedRowProps,
  numberHeader,
  renderCell,
} from './grouped-cells';

type Totals = SystemExpensesPage['summary']['totals'];
export type ExpenseTableRow = GroupedRow<SystemExpenseRow, SystemBranchGroup, Totals>;

const helper = columnHelperFor<ExpenseTableRow>();

const expensesLabel = (count: number) => `${count} ${count === 1 ? 'gasto' : 'gastos'}`;

export const expenseRowProps = groupedRowProps<SystemExpenseRow, SystemBranchGroup, Totals>(
  (group) => `Subtotal de ${group.branchName}`,
  'Total global',
);

// A trip spends fuel and depreciation on its route; the workshop spends labor and parts on a job.
function ExpenseDetail({ expense }: { expense: SystemExpenseRow }) {
  if (expense.concept === 'FUEL' || expense.concept === 'DEPRECIATION') {
    return expense.originLabel !== null && expense.destinationLabel !== null ? (
      <span>{`${expense.originLabel} → ${expense.destinationLabel}`}</span>
    ) : (
      <span className="text-muted-foreground">Viaje sin datos</span>
    );
  }
  return (
    <span className="flex flex-col">
      <span>{expense.description}</span>
      {expense.categoryName !== null && (
        <span className="text-muted-foreground">{expense.categoryName}</span>
      )}
    </span>
  );
}

export const expenseColumns = helper.columns([
  helper.display({
    id: 'branch',
    header: 'Sucursal',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (expense) => <span className="font-semibold">{expense.branchName}</span>,
        subtotal: (group) => <span>{`Subtotal · ${group.branchName}`}</span>,
        total: () => <span>Total global</span>,
      }),
  }),
  helper.display({
    id: 'day',
    header: 'Fecha',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (expense) => (
          <span className="whitespace-nowrap">{formatShortDate(expense.day, true)}</span>
        ),
      }),
  }),
  helper.display({
    id: 'concept',
    header: 'Concepto',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (expense) => (
          <span className="whitespace-nowrap">{EXPENSE_CONCEPT_LABELS[expense.concept]}</span>
        ),
      }),
  }),
  helper.display({
    id: 'bus',
    header: 'Bus',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (expense) => busPlateCell(expense.busPlate),
      }),
  }),
  helper.display({
    id: 'detail',
    header: 'Detalle',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (expense) => <ExpenseDetail expense={expense} />,
        subtotal: (group) => <span>{expensesLabel(group.entries)}</span>,
        total: (totals) => <span>{expensesLabel(totals.entries)}</span>,
      }),
  }),
  helper.display({
    id: 'amount',
    header: () => numberHeader('Monto'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (expense) => amountCell(formatQuetzales(expense.amount)),
        subtotal: (group) => amountCell(formatQuetzales(group.amount)),
        total: (totals) => amountCell(formatQuetzales(totals.amount)),
      }),
  }),
]);
