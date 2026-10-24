import { type GroupedRow, withSubtotals, withTotal } from './grouped-rows';

interface Row {
  id: string;
  group: string;
}
interface Group {
  key: string;
  size: number;
}

const rows = (group: string, count: number, from = 1): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${group}${from + index}`, group }));

const spec = {
  rowId: (row: Row) => row.id,
  groupId: (group: Group) => group.key,
  groupSize: (group: Group) => group.size,
};
const groups: Group[] = [
  { key: 'A', size: 3 },
  { key: 'B', size: 2 },
  { key: 'C', size: 2 },
];
const all = [...rows('A', 3), ...rows('B', 2), ...rows('C', 2)];
const totals = { amount: 70 };

const shape = <G>(items: GroupedRow<Row, G, typeof totals>[]) =>
  items.map((item) => (item.kind === 'row' ? item.row.id : item.id));

const report = (
  items: Row[],
  groupsOfReport: Group[],
  page: number,
  pageSize: number,
  total: number,
) => ({
  items,
  page,
  pageSize,
  total,
  summary: { totals, groups: groupsOfReport },
});

const page = (number: number, pageSize: number) =>
  shape(
    withSubtotals(
      report(
        all.slice((number - 1) * pageSize, number * pageSize),
        groups,
        number,
        pageSize,
        all.length,
      ),
      spec,
    ),
  );

describe('withSubtotals', () => {
  it('puts the subtotal of each group right under its last row and the total at the end', () => {
    expect(page(1, 20)).toEqual([
      'A1',
      'A2',
      'A3',
      'subtotal:A',
      'B1',
      'B2',
      'subtotal:B',
      'C1',
      'C2',
      'subtotal:C',
      'total',
    ]);
  });

  it('keeps the subtotal of a group that is cut by the end of the page for the next one', () => {
    expect(page(1, 2)).toEqual(['A1', 'A2']);
    expect(page(2, 2)).toEqual(['A3', 'subtotal:A', 'B1']);
    expect(page(3, 2)).toEqual(['B2', 'subtotal:B', 'C1']);
    expect(page(4, 2)).toEqual(['C2', 'subtotal:C', 'total']);
  });

  it('closes a group on the last row of a page when the next page starts a new one', () => {
    expect(page(1, 3)).toEqual(['A1', 'A2', 'A3', 'subtotal:A']);
    expect(page(2, 3)).toEqual(['B1', 'B2', 'subtotal:B', 'C1']);
    expect(page(3, 3)).toEqual(['C2', 'subtotal:C', 'total']);
  });

  it('carries the group and the totals of the whole filter in the rows it adds', () => {
    const [, , , subtotal, , , , , , , total] = withSubtotals(
      report(all, groups, 1, 20, all.length),
      spec,
    );

    expect(subtotal).toEqual({ kind: 'subtotal', id: 'subtotal:A', group: groups[0] });
    expect(total).toEqual({ kind: 'total', id: 'total', totals });
  });

  it('adds only the total when the report has no groups', () => {
    expect(shape(withSubtotals(report(rows('A', 2), [], 1, 20, 2), spec))).toEqual([
      'A1',
      'A2',
      'total',
    ]);
  });

  it('adds nothing to an empty report or to a page that is not the last', () => {
    expect(withSubtotals(report([], [], 1, 20, 0), spec)).toEqual([]);
    expect(page(1, 4)).not.toContain('total');
  });

  it('skips a group without rows', () => {
    expect(
      shape(
        withSubtotals(
          report(
            rows('A', 1),
            [
              { key: 'Z', size: 0 },
              { key: 'A', size: 1 },
            ],
            1,
            20,
            1,
          ),
          spec,
        ),
      ),
    ).toEqual(['A1', 'subtotal:A', 'total']);
  });
});

describe('withTotal', () => {
  it('adds the total after the last row of the last page and nothing before', () => {
    const firstPage = { items: rows('A', 2), page: 1, pageSize: 2, total: 3, summary: { totals } };
    const lastPage = { ...firstPage, items: rows('A', 1, 3), page: 2 };

    expect(shape(withTotal(firstPage, spec.rowId))).toEqual(['A1', 'A2']);
    expect(shape(withTotal(lastPage, spec.rowId))).toEqual(['A3', 'total']);
  });
});
