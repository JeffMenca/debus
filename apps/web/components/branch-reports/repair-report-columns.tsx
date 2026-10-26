'use client';

import type { BranchRepairExpenseRow, RepairCategoryShare } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { ExpandToggle } from '@/components/data/row-expansion';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { cn } from '@/lib/utils';

const helper = columnHelperFor<BranchRepairExpenseRow>();

const UNKNOWN_BUS = 'Bus sin datos';

const busTitle = (row: BranchRepairExpenseRow): string =>
  row.plate === null ? UNKNOWN_BUS : formatPlate(row.plate);

const numberHeader = (header: string) => <span className="block text-right">{header}</span>;

const linesLabel = (lines: number) => `${lines} ${lines === 1 ? 'línea' : 'líneas'}`;

// The button that opens a bus: it names the bus for a screen reader.
function BusToggle({ row }: { row: BranchRepairExpenseRow }) {
  return (
    <ExpandToggle id={row.busId}>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn('whitespace-nowrap', row.plate !== null && 'font-mono font-bold')}>
          {busTitle(row)}
        </span>
        {row.brand !== null && (
          <span className="text-muted-foreground">{`${row.brand} ${row.model}`}</span>
        )}
      </span>
    </ExpandToggle>
  );
}

export const repairReportColumns = helper.columns([
  helper.display({
    id: 'bus',
    header: 'Bus',
    cell: ({ row }) => <BusToggle row={row.original} />,
  }),
  helper.accessor('expenses', {
    header: () => numberHeader('Gastos'),
    cell: (info) => (
      <span className="block text-right font-mono tabular-nums">{info.getValue()}</span>
    ),
  }),
  helper.accessor('total', {
    header: () => numberHeader('Total'),
    cell: (info) => (
      <span className="block text-right font-mono font-bold tabular-nums">
        {formatQuetzales(info.getValue())}
      </span>
    ),
  }),
]);

function CategoryLine({ category }: { category: RepairCategoryShare }) {
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 py-1.5">
      <span className="font-semibold">{category.categoryName}</span>
      <span className="text-muted-foreground">{linesLabel(category.lines)}</span>
      <span className="min-w-28 text-right font-mono tabular-nums">
        {formatQuetzales(category.amount)}
      </span>
    </li>
  );
}

// What a bus spent in each category, the biggest first (the API sends them in that order).
export function RepairCategories({ row }: { row: BranchRepairExpenseRow }) {
  return (
    <section aria-label={`Categorías de ${busTitle(row)}`} className="pl-6">
      <p className="text-xs font-medium text-muted-foreground">Subtotal por categoría</p>
      <ul className="divide-y divide-muted">
        {row.categories.map((category) => (
          <CategoryLine key={category.categoryId} category={category} />
        ))}
      </ul>
    </section>
  );
}
