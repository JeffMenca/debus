// The rows of a report grouped by branch or category, as one list the table paints: the rows of
// the page, a subtotal under the last row of each group and the total after the last row of all.
export type GroupedRow<Row, Group, Totals> =
  | { kind: 'row'; id: string; row: Row }
  | { kind: 'subtotal'; id: string; group: Group }
  | { kind: 'total'; id: string; totals: Totals };

// A page of a report as the server sends it.
interface ReportPage<Row, Totals> {
  // The rows of this page, already ordered by group by the server.
  items: Row[];
  page: number;
  pageSize: number;
  // The rows of the whole filter, not of the page.
  total: number;
  summary: { totals: Totals };
}

interface GroupedReportPage<Row, Group, Totals> extends ReportPage<Row, Totals> {
  // Every group of the filter, in the order of the rows; empty when the report has no subtotals.
  summary: { totals: Totals; groups: Group[] };
}

interface GroupKeys<Row, Group> {
  rowId: (row: Row) => string;
  groupId: (group: Group) => string;
  groupSize: (group: Group) => number;
}

// A group that goes on in the next page gets its subtotal there, under its real last row: the
// position of that row in the whole filter comes from adding the sizes of the groups.
export function withSubtotals<Row, Group, Totals>(
  {
    items,
    page,
    pageSize,
    total,
    summary: { totals, groups },
  }: GroupedReportPage<Row, Group, Totals>,
  { rowId, groupId, groupSize }: GroupKeys<Row, Group>,
): GroupedRow<Row, Group, Totals>[] {
  const closing = new Map<number, Group>();
  let end = -1;
  for (const group of groups) {
    const size = groupSize(group);
    if (size <= 0) continue;
    end += size;
    closing.set(end, group);
  }

  const firstIndex = (page - 1) * pageSize;
  const result: GroupedRow<Row, Group, Totals>[] = [];
  items.forEach((row, offset) => {
    result.push({ kind: 'row', id: rowId(row), row });
    const group = closing.get(firstIndex + offset);
    if (group) result.push({ kind: 'subtotal', id: `subtotal:${groupId(group)}`, group });
  });
  if (items.length > 0 && firstIndex + items.length >= total) {
    result.push({ kind: 'total', id: 'total', totals });
  }
  return result;
}

// The same for a report that has no groups, such as one row per branch or per route.
export const withTotal = <Row, Totals>(
  report: ReportPage<Row, Totals>,
  rowId: (row: Row) => string,
): GroupedRow<Row, never, Totals>[] =>
  withSubtotals<Row, never, Totals>(
    { ...report, summary: { totals: report.summary.totals, groups: [] } },
    { rowId, groupId: () => '', groupSize: () => 0 },
  );
