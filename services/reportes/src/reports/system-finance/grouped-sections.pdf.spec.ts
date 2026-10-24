import { groupedSections } from './grouped-sections.pdf';

interface Line {
  category: string;
  label: string;
  amount: number;
}

describe('groupedSections', () => {
  const rows: Line[] = [
    { category: 'c1', label: 'a', amount: 100 },
    { category: 'c2', label: 'b', amount: 50 },
    { category: 'c2', label: 'c', amount: 25 },
  ];
  const groups = [
    { key: 'c1', label: 'Llantas', amount: 100 },
    { key: 'c2', label: 'Motor', amount: 75 },
  ];
  const build = (over: Partial<Parameters<typeof groupedSections<Line>>[0]> = {}) =>
    groupedSections<Line>({
      rows,
      groups,
      keyOf: (row) => row.category,
      columnCount: 2,
      amountColumn: 1,
      cellsOf: (row) => [row.label, `Q ${row.amount}`],
      formatAmount: (amount) => `Q ${amount}`,
      subtotalLabel: (label) => `Total de ${label}`,
      totalLabel: 'Gran total',
      totalAmount: 175,
      ...over,
    });

  it('opens each group with its label, lists its rows and closes it with its subtotal', () => {
    expect(build()).toEqual([
      { cells: ['Llantas', ''], tone: 'group' },
      { cells: ['a', 'Q 100'] },
      { cells: ['Total de Llantas', 'Q 100'], tone: 'subtotal' },
      { cells: ['Motor', ''], tone: 'group' },
      { cells: ['b', 'Q 50'] },
      { cells: ['c', 'Q 25'] },
      { cells: ['Total de Motor', 'Q 75'], tone: 'subtotal' },
      { cells: ['Gran total', 'Q 175'], tone: 'total' },
    ]);
  });

  it('answers no rows at all when nothing matched', () => {
    expect(build({ rows: [], groups: [] })).toEqual([]);
  });
});
