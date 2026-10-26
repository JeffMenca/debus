'use client';

import type { SystemProfitPage, SystemProfitRow } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { ExpandToggle } from '@/components/data/row-expansion';
import { KPI_TONE_SURFACES } from '@/components/data/kpi-card';
import { formatPercent, formatQuetzales } from '@/lib/format';
import type { GroupedRow } from '@/lib/system-reports/grouped-rows';
import { cn } from '@/lib/utils';
import { groupedRowProps, numberHeader, renderCell } from './grouped-cells';

type Totals = SystemProfitPage['summary']['totals'];
export type ProfitTableRow = GroupedRow<SystemProfitRow, never, Totals>;

const helper = columnHelperFor<ProfitTableRow>();

export const profitRowProps = groupedRowProps<SystemProfitRow, never, Totals>(
  () => '',
  'Total global',
);

const moneyCell = (value: number, strong = false) => (
  <span
    className={cn(
      'block text-right font-mono tabular-nums',
      strong && 'font-bold',
      strong && value < 0 && 'text-coral-700',
    )}
  >
    {formatQuetzales(value)}
  </span>
);

const marginCell = (margin: number | null) => (
  <span className="block text-right font-mono text-muted-foreground tabular-nums">
    {formatPercent(margin)}
  </span>
);

export const profitColumns = helper.columns([
  helper.display({
    id: 'branch',
    header: 'Sucursal',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (branch) => (
          <ExpandToggle id={branch.branchId}>
            <span className="font-semibold">{branch.branchName}</span>
          </ExpandToggle>
        ),
        total: () => <span>Total global</span>,
      }),
  }),
  helper.display({
    id: 'income',
    header: () => numberHeader('Ingresos'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (branch) => moneyCell(branch.income),
        total: (totals) => moneyCell(totals.income),
      }),
  }),
  helper.display({
    id: 'expenses',
    header: () => numberHeader('Gastos'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (branch) => moneyCell(branch.expenses),
        total: (totals) => moneyCell(totals.expenses),
      }),
  }),
  helper.display({
    id: 'profit',
    header: () => numberHeader('Ganancia neta'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (branch) => moneyCell(branch.profit, true),
        total: (totals) => moneyCell(totals.profit, true),
      }),
  }),
  helper.display({
    id: 'margin',
    header: () => numberHeader('Margen'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (branch) => marginCell(branch.margin),
        total: (totals) => marginCell(totals.margin),
      }),
  }),
]);

const signed = (sign: '+' | '-', value: number) => `${sign} ${formatQuetzales(value)}`;

function Chip({ label, value, tone }: { label: string; value: string; tone: 'mint' | 'coral' }) {
  return (
    <li className={cn('flex flex-col gap-1 rounded-2xl p-3', KPI_TONE_SURFACES[tone])}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="font-mono text-sm font-medium tabular-nums">{value}</span>
    </li>
  );
}

// Where the income of a branch came from and where its expenses went.
export function ProfitBreakdown({ branch }: { branch: SystemProfitRow }) {
  return (
    <section aria-label={`Desglose de ${branch.branchName}`} className="pl-6">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-2">
        <Chip label="Boletos" value={signed('+', branch.ticketIncome)} tone="mint" />
        <Chip label="Alquileres" value={signed('+', branch.rentalIncome)} tone="mint" />
        <Chip label="Combustible" value={signed('-', branch.fuel)} tone="coral" />
        <Chip label="Taller" value={signed('-', branch.labor)} tone="coral" />
        <Chip label="Repuestos" value={signed('-', branch.parts)} tone="coral" />
        <Chip label="Depreciación" value={signed('-', branch.depreciation)} tone="coral" />
      </ul>
    </section>
  );
}
