import { userListWhere } from './user-scope';

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
      OR: [
        { fullName: { contains: 'ana', mode: 'insensitive' } },
        { email: { contains: 'ana', mode: 'insensitive' } },
      ],
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
});
