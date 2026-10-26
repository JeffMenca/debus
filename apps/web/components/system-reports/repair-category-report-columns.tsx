'use client';

import type {
  RepairCategoryShare,
  SystemRepairExpenseRow,
  SystemRepairExpensesPage,
} from '@debus/contracts';
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

type Totals = SystemRepairExpensesPage['summary']['totals'];
export type RepairCategoryTableRow = GroupedRow<
  SystemRepairExpenseRow,
  RepairCategoryShare,
  Totals
>;

const helper = columnHelperFor<RepairCategoryTableRow>();

const linesLabel = (lines: number) => `${lines} ${lines === 1 ? 'línea' : 'líneas'}`;

export const repairCategoryRowProps = groupedRowProps<
  SystemRepairExpenseRow,
  RepairCategoryShare,
  Totals
>((group) => `Subtotal de ${group.categoryName}`, 'Total general');

export const repairCategoryColumns = helper.columns([
  helper.display({
    id: 'category',
    header: 'Categoría',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (line) => <span className="font-semibold">{line.categoryName}</span>,
        subtotal: (group) => <span>{`Subtotal · ${group.categoryName}`}</span>,
        total: () => <span>Total general</span>,
      }),
  }),
  helper.display({
    id: 'date',
    header: 'Fecha',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (line) => (
          <span className="whitespace-nowrap">{formatShortDate(line.serviceDate, true)}</span>
        ),
      }),
  }),
  helper.display({
    id: 'bus',
    header: 'Bus',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (line) => busPlateCell(line.busPlate),
      }),
  }),
  helper.display({
    id: 'branch',
    header: 'Sucursal',
    cell: ({ row }) => renderCell(row.original, { row: (line) => <span>{line.branchName}</span> }),
  }),
  helper.display({
    id: 'kind',
    header: 'Tipo',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (line) => (
          <span className="whitespace-nowrap">{EXPENSE_CONCEPT_LABELS[line.kind]}</span>
        ),
      }),
  }),
  helper.display({
    id: 'description',
    header: 'Descripción',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (line) => <span>{line.description}</span>,
        subtotal: (group) => <span>{linesLabel(group.lines)}</span>,
        total: (totals) => <span>{linesLabel(totals.lines)}</span>,
      }),
  }),
  helper.display({
    id: 'amount',
    header: () => numberHeader('Monto'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (line) => amountCell(formatQuetzales(line.amount)),
        subtotal: (group) => amountCell(formatQuetzales(group.amount)),
        total: (totals) => amountCell(formatQuetzales(totals.amount)),
      }),
  }),
]);
