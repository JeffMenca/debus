import { Prisma } from '../../generated/prisma/client';
import {
  NO_BRANCH_NAME,
  branchEntriesOrder,
  branchGroupsQuery,
  branchOrder,
  dayRangeFilter,
  entriesWithBranch,
  isBranch,
} from './branch-entries.sql';

describe('branch entries sql', () => {
  it('filters by an inclusive day range and leaves each end open when it is missing', () => {
    const both = dayRangeFilter('s.paid_on', '2026-10-01', '2026-10-31');
    expect(both.sql).toContain('s.paid_on >= ?::date');
    expect(both.sql).toContain('s.paid_on <= ?::date');
    expect(both.values).toEqual(['2026-10-01', '2026-10-31']);

    expect(dayRangeFilter('s.paid_on', '2026-10-01', undefined).values).toEqual(['2026-10-01']);
    expect(dayRangeFilter('s.paid_on', undefined, '2026-10-31').sql).not.toContain('>=');
    expect(dayRangeFilter('s.paid_on').sql.trim()).toBe('');
  });

  it('filters by one branch only when it is chosen', () => {
    expect(isBranch('s.branch_id', 'b1').sql).toContain('s.branch_id = ?::uuid');
    expect(isBranch('s.branch_id').sql.trim()).toBe('');
  });

  it('names every entry after its branch, or says there is no data for a branch not copied yet', () => {
    const joined = entriesWithBranch(Prisma.sql`SELECT 1 AS branch_id`);

    expect(joined.sql).toContain('LEFT JOIN branches');
    expect(joined.values).toEqual([NO_BRANCH_NAME]);
    expect(NO_BRANCH_NAME).toBe('Sucursal sin datos');
  });

  it('orders branches alphabetically without accents and breaks ties by id', () => {
    expect(branchOrder.sql).toBe('fold_search_text(branch_name), branch_id');
  });

  it('lists the entries of each branch from the latest day, with the id breaking ties', () => {
    expect(branchEntriesOrder.sql).toBe(
      'ORDER BY fold_search_text(branch_name), branch_id, day DESC, id',
    );
  });

  it('groups the entries by branch in the same order', () => {
    const query = branchGroupsQuery(Prisma.sql`SELECT 1 AS branch_id`);

    expect(query.sql).toContain('GROUP BY branch_id, branch_name');
    expect(query.sql).toContain('ORDER BY fold_search_text(branch_name), branch_id');
  });
});
