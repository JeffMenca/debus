import { branchFilter, branchSections } from './branch-sections.pdf';

interface Entry {
  branchId: string;
  branchName: string;
  label: string;
  amount: number;
}
const entry = (branchId: string, branchName: string, label: string, amount: number): Entry => ({
  branchId,
  branchName,
  label,
  amount,
});
const build = (rows: Entry[], groups: { branchId: string; branchName: string; amount: number }[]) =>
  branchSections({
    rows,
    groups: groups.map((group) => ({ ...group, entries: 0 })),
    columnCount: 3,
    amountColumn: 2,
    cellsOf: (row) => [row.label, 'x', `Q ${row.amount}`],
    formatAmount: (amount) => `Q ${amount}`,
    totalLabel: 'Total global',
    totalAmount: 600,
  });

describe('branchSections', () => {
  const rows = [
    entry('b1', 'Ángeles', 'a', 100),
    entry('b1', 'Ángeles', 'b', 200),
    entry('b2', 'Boca', 'c', 300),
  ];
  const groups = [
    { branchId: 'b1', branchName: 'Ángeles', amount: 300 },
    { branchId: 'b2', branchName: 'Boca', amount: 300 },
  ];

  it('opens each branch with a group row, lists its rows and closes it with its subtotal', () => {
    expect(build(rows, groups)).toEqual([
      { cells: ['Ángeles', '', ''], tone: 'group' },
      { cells: ['a', 'x', 'Q 100'] },
      { cells: ['b', 'x', 'Q 200'] },
      { cells: ['Subtotal Ángeles', '', 'Q 300'], tone: 'subtotal' },
      { cells: ['Boca', '', ''], tone: 'group' },
      { cells: ['c', 'x', 'Q 300'] },
      { cells: ['Subtotal Boca', '', 'Q 300'], tone: 'subtotal' },
      { cells: ['Total global', '', 'Q 600'], tone: 'total' },
    ]);
  });

  it('answers no rows at all when nothing matched, so the table shows its empty message', () => {
    expect(build([], [])).toEqual([]);
  });

  it('puts the amount of a subtotal in the column that holds the amounts', () => {
    const [, , , subtotal] = branchSections({
      rows: rows.slice(0, 2),
      groups: [{ ...groups[0]!, entries: 2 }],
      columnCount: 5,
      amountColumn: 4,
      cellsOf: (row) => [row.label, '', '', '', `Q ${row.amount}`],
      formatAmount: (amount) => `Q ${amount}`,
      totalLabel: 'Gran total',
      totalAmount: 300,
    });

    expect(subtotal?.cells).toEqual(['Subtotal Ángeles', '', '', '', 'Q 300']);
  });
});

describe('branchFilter', () => {
  it('names the chosen branch, or says there is no data when it has no copy yet', () => {
    expect(branchFilter('b1', 'Ángeles')).toEqual(['Sucursal: Ángeles']);
    expect(branchFilter('b1', null)).toEqual(['Sucursal: Sucursal sin datos']);
    expect(branchFilter('b1', 'Boca', 'Sucursal de origen')).toEqual(['Sucursal de origen: Boca']);
  });

  it('writes no filter when no branch was chosen', () => {
    expect(branchFilter(undefined, null)).toEqual([]);
  });
});
