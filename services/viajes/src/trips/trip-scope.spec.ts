import { tripListWhere, tripOrder } from './trip-scope';

const base = { status: 'all' as const, page: 1, pageSize: 20 };

describe('trip list scope', () => {
  it('keeps the branch and nothing else by default', () => {
    expect(tripListWhere('b', base)).toEqual({ branchId: 'b' });
  });

  it('covers whole Guatemalan days between from and to', () => {
    expect(tripListWhere('b', { ...base, from: '2026-10-20', to: '2026-10-20' })).toEqual({
      branchId: 'b',
      departureAt: {
        gte: new Date('2026-10-20T06:00:00.000Z'),
        lt: new Date('2026-10-21T06:00:00.000Z'),
      },
    });
    expect(tripListWhere('b', { ...base, from: '2026-10-20' })).toEqual({
      branchId: 'b',
      departureAt: { gte: new Date('2026-10-20T06:00:00.000Z') },
    });
  });

  it('filters by status and by the accent-free search, escaping the wildcards', () => {
    expect(tripListWhere('b', { ...base, status: 'IN_TRANSIT', q: 'peten_' })).toEqual({
      branchId: 'b',
      status: 'IN_TRANSIT',
      searchText: { contains: 'peten\\_' },
    });
  });

  it('orders by departure, with the id breaking ties', () => {
    expect(tripOrder()).toEqual([{ departureAt: 'asc' }, { id: 'asc' }]);
  });
});
