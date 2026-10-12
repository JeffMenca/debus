import { driverListWhere, driverOrder } from './driver-scope';

describe('driver list scope', () => {
  const base = { status: 'active' as const, page: 1, pageSize: 20 };

  it('keeps the branch and the status', () => {
    expect(driverListWhere('b', base, '2026-10-11')).toEqual({ branchId: 'b', active: true });
    expect(driverListWhere('b', { ...base, status: 'all' }, '2026-10-11')).toEqual({
      branchId: 'b',
    });
    expect(driverListWhere('b', { ...base, status: 'inactive' }, '2026-10-11')).toEqual({
      branchId: 'b',
      active: false,
    });
  });

  it('finds the licences that expire within the window, expired ones included', () => {
    expect(driverListWhere('b', { ...base, expiringWithinDays: 30 }, '2026-10-11')).toEqual({
      branchId: 'b',
      active: true,
      licenseExpiresOn: { lte: new Date('2026-11-10T00:00:00.000Z') },
    });
  });

  it('searches the accent-free text, escaping the wildcards', () => {
    expect(driverListWhere('b', { ...base, q: 'jose_' }, '2026-10-11')).toEqual({
      branchId: 'b',
      active: true,
      searchText: { contains: 'jose\\_' },
    });
  });

  it('orders by name, or by expiry when looking for expiring licences', () => {
    expect(driverOrder(base)).toEqual([{ fullName: 'asc' }, { id: 'asc' }]);
    expect(driverOrder({ ...base, expiringWithinDays: 30 })).toEqual([
      { licenseExpiresOn: 'asc' },
      { id: 'asc' },
    ]);
  });
});
