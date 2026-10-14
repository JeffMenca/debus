import { rentalListWhere, rentalOrder } from './rental-scope';

const base = { status: 'PENDING' as const, page: 1, pageSize: 20 };

describe('rental list scope', () => {
  it('keeps the branch and the status', () => {
    expect(rentalListWhere('b', base)).toEqual({ branchId: 'b', status: 'PENDING' });
  });

  it('shows every status when asked for all', () => {
    expect(rentalListWhere('b', { ...base, status: 'all' })).toEqual({ branchId: 'b' });
  });

  it('searches the accent-free text, escaping the wildcards', () => {
    expect(rentalListWhere('b', { ...base, q: 'jose_' })).toEqual({
      branchId: 'b',
      status: 'PENDING',
      searchText: { contains: 'jose\\_' },
    });
  });

  it('orders by departure, with the id breaking ties', () => {
    expect(rentalOrder()).toEqual([{ departureAt: 'asc' }, { id: 'asc' }]);
  });
});
