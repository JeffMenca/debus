import { userCountWhere, userListWhere } from './user-scope';

const userId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';

describe('userListWhere', () => {
  it('lets a system admin filter everything', () => {
    expect(
      userListWhere(
        { userId, role: 'SYSTEM_ADMIN', branchId: null },
        { role: 'BRANCH_ADMIN', status: 'ACTIVE', branchId, q: 'ana' },
      ),
    ).toEqual({
      role: 'BRANCH_ADMIN',
      status: 'ACTIVE',
      branchId,
      searchText: { contains: 'ana' },
    });
    expect(userListWhere({ userId, role: 'SYSTEM_ADMIN', branchId: null }, {})).toEqual({});
  });

  it('keeps a branch admin inside the cashiers and drivers of their branch', () => {
    const actor = { userId, role: 'BRANCH_ADMIN' as const, branchId };
    expect(userListWhere(actor, {})).toEqual({ branchId, role: { in: ['CASHIER', 'DRIVER'] } });
    expect(userListWhere(actor, { role: 'DRIVER', branchId: userId })).toEqual({
      branchId,
      role: 'DRIVER',
    });
    expect(userListWhere(actor, { role: 'SYSTEM_ADMIN' })).toEqual({
      branchId,
      role: { in: [] },
    });
  });

  it('searches the folded text and splits staff from clients', () => {
    const admin = { userId, role: 'SYSTEM_ADMIN' as const, branchId: null };
    const paging = { page: 1, pageSize: 20 };
    expect(userListWhere(admin, { q: 'jose', group: 'staff', ...paging })).toEqual({
      role: { not: 'CLIENT' },
      searchText: { contains: 'jose' },
    });
    expect(userListWhere(admin, { group: 'clients', ...paging })).toEqual({ role: 'CLIENT' });
  });

  it('searches % and _ as the characters they are', () => {
    const admin = { userId, role: 'SYSTEM_ADMIN' as const, branchId: null };
    expect(userListWhere(admin, { q: '100%_a' })).toEqual({
      searchText: { contains: '100\\%\\_a' },
    });
  });

  it('prefers the role over the group, the finer filter', () => {
    const admin = { userId, role: 'SYSTEM_ADMIN' as const, branchId: null };
    expect(userListWhere(admin, { role: 'DRIVER', group: 'clients' })).toEqual({ role: 'DRIVER' });
  });

  it('does not let the group widen what a branch admin may see', () => {
    const actor = { userId, role: 'BRANCH_ADMIN' as const, branchId };
    expect(userListWhere(actor, { group: 'clients' })).toEqual({
      branchId,
      role: { in: ['CASHIER', 'DRIVER'] },
    });
  });
});

describe('userCountWhere', () => {
  it('counts the tabs without the status filter', () => {
    const admin = { userId, role: 'SYSTEM_ADMIN' as const, branchId: null };
    expect(
      userCountWhere(admin, { status: 'ACTIVE', role: 'DRIVER', page: 1, pageSize: 20 }),
    ).toEqual({ role: 'DRIVER' });
  });
});
