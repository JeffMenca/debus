import type { PdfRow } from '../../common/pdf/report-document';

interface Group {
  key: string;
  label: string;
  amount: number;
}

interface GroupedSectionsInput<R> {
  rows: R[];
  groups: Group[];
  keyOf: (row: R) => string;
  columnCount: number;
  amountColumn: number;
  cellsOf: (row: R) => string[];
  formatAmount: (amount: number) => string;
  subtotalLabel: (groupLabel: string) => string;
  totalLabel: string;
  totalAmount: number;
}

const blanks = (count: number): string[] => Array.from({ length: count }, () => '');

// One section per group, in the order of the groups: its label, its rows and its subtotal; then
// the grand total. The first column carries the labels, the amount column the amounts.
export function groupedSections<R>({
  rows,
  groups,
  keyOf,
  columnCount,
  amountColumn,
  cellsOf,
  formatAmount,
  subtotalLabel,
  totalLabel,
  totalAmount,
}: GroupedSectionsInput<R>): PdfRow[] {
  if (rows.length === 0) return [];
  const labelled = (label: string, amount?: string): string[] => {
    const cells = [label, ...blanks(columnCount - 1)];
    if (amount !== undefined) cells[amountColumn] = amount;
    return cells;
  };
  return [
    ...groups.flatMap((group) => [
      { cells: labelled(group.label), tone: 'group' as const },
      ...rows.filter((row) => keyOf(row) === group.key).map((row) => ({ cells: cellsOf(row) })),
      {
        cells: labelled(subtotalLabel(group.label), formatAmount(group.amount)),
        tone: 'subtotal' as const,
      },
    ]),
    { cells: labelled(totalLabel, formatAmount(totalAmount)), tone: 'total' as const },
  ];
}
