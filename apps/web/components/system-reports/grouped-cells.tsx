import type { ReactNode } from 'react';
import { formatPlate } from '@/lib/format';
import type { GroupedRow } from '@/lib/system-reports/grouped-rows';

interface CellRenderers<Row, Group, Totals> {
  row?: (row: Row) => ReactNode;
  subtotal?: (group: Group) => ReactNode;
  total?: (totals: Totals) => ReactNode;
}

// One cell of a table that mixes rows, subtotals and a total: what each kind of row writes in it.
export function renderCell<Row, Group, Totals>(
  item: GroupedRow<Row, Group, Totals>,
  { row, subtotal, total }: CellRenderers<Row, Group, Totals>,
): ReactNode {
  if (item.kind === 'row') return row?.(item.row) ?? null;
  if (item.kind === 'subtotal') return subtotal?.(item.group) ?? null;
  return total?.(item.totals) ?? null;
}

// The look of the rows that add up the others, and the name a screen reader gives them.
export const groupedRowProps =
  <Row, Group, Totals>(subtotalLabel: (group: Group) => string, totalLabel: string) =>
  (item: GroupedRow<Row, Group, Totals>) => {
    if (item.kind === 'subtotal') {
      return { className: 'bg-background font-semibold', label: subtotalLabel(item.group) };
    }
    if (item.kind === 'total') {
      return { className: 'bg-lilac-100 font-bold text-lilac-700', label: totalLabel };
    }
    return undefined;
  };

export const numberHeader = (header: string) => <span className="block text-right">{header}</span>;

export const numberCell = (value: number | string) => (
  <span className="block text-right font-mono tabular-nums">{value}</span>
);

export const amountCell = (value: string) => (
  <span className="block text-right font-mono font-bold tabular-nums">{value}</span>
);

// A bus that has not reached the report yet has no plate to show.
export const busPlateCell = (plate: string | null) =>
  plate === null ? (
    <span className="text-muted-foreground">Bus sin datos</span>
  ) : (
    <span className="font-mono font-bold whitespace-nowrap">{formatPlate(plate)}</span>
  );
