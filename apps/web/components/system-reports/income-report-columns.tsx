'use client';

import type { SystemBranchGroup, SystemIncomePage, SystemIncomeRow } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { formatQuetzales, formatShortDate } from '@/lib/format';
import type { GroupedRow } from '@/lib/system-reports/grouped-rows';
import { INCOME_CONCEPT_LABELS } from '@/lib/system-reports/labels';
import { amountCell, groupedRowProps, numberCell, numberHeader, renderCell } from './grouped-cells';

type Totals = SystemIncomePage['summary']['totals'];
export type IncomeTableRow = GroupedRow<SystemIncomeRow, SystemBranchGroup, Totals>;

const helper = columnHelperFor<IncomeTableRow>();

const salesLabel = (count: number) => `${count} ${count === 1 ? 'venta' : 'ventas'}`;

export const incomeRowProps = groupedRowProps<SystemIncomeRow, SystemBranchGroup, Totals>(
  (group) => `Subtotal de ${group.branchName}`,
  'Total global',
);

export const incomeColumns = helper.columns([
  helper.display({
    id: 'branch',
    header: 'Sucursal',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (sale) => <span className="font-semibold">{sale.branchName}</span>,
        subtotal: (group) => <span>{`Subtotal · ${group.branchName}`}</span>,
        total: () => <span>Total global</span>,
      }),
  }),
  helper.display({
    id: 'day',
    header: 'Fecha de pago',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (sale) => <span className="whitespace-nowrap">{formatShortDate(sale.day, true)}</span>,
      }),
  }),
  helper.display({
    id: 'concept',
    header: 'Concepto',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (sale) => (
          <span className="whitespace-nowrap">{INCOME_CONCEPT_LABELS[sale.concept]}</span>
        ),
      }),
  }),
  helper.display({
    id: 'detail',
    header: 'Detalle',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (sale) => (
          <span className="flex flex-col">
            <span>{`${sale.originLabel} → ${sale.destinationLabel}`}</span>
            {sale.clientName !== null && (
              <span className="text-muted-foreground">{sale.clientName}</span>
            )}
          </span>
        ),
        subtotal: (group) => <span>{salesLabel(group.entries)}</span>,
        total: (totals) => <span>{salesLabel(totals.entries)}</span>,
      }),
  }),
  helper.display({
    id: 'quantity',
    header: () => numberHeader('Cantidad'),
    cell: ({ row }) => renderCell(row.original, { row: (sale) => numberCell(sale.quantity) }),
  }),
  helper.display({
    id: 'amount',
    header: () => numberHeader('Monto'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (sale) => amountCell(formatQuetzales(sale.amount)),
        subtotal: (group) => amountCell(formatQuetzales(group.amount)),
        total: (totals) => amountCell(formatQuetzales(totals.amount)),
      }),
  }),
]);
