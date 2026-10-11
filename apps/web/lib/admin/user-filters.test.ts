import type { ManagedUser, UserRole } from '@debus/contracts';
import { countUsersByTab, filterUsers } from './user-filters';

const user = (
  id: string,
  fullName: string,
  role: UserRole,
  status: ManagedUser['status'],
  branchId: string | null = null,
): ManagedUser => ({ id, fullName, email: `${id}@correo.com`, role, status, branchId });

const users = [
  user('ana', 'Ana Sic', 'CASHIER', 'ACTIVE', 'b1'),
  user('jose', 'José Pérez', 'DRIVER', 'PENDING', 'b2'),
  user('luis', 'Luis Ramírez', 'BRANCH_ADMIN', 'INACTIVE', 'b1'),
];
const all = { tab: 'all' as const, role: 'all' as const, branchId: 'all', search: '' };

describe('filterUsers', () => {
  it('combines tab, role, branch and an accent-insensitive search', () => {
    expect(filterUsers(users, all)).toHaveLength(3);
    expect(filterUsers(users, { ...all, tab: 'PENDING' }).map((u) => u.id)).toEqual(['jose']);
    expect(
      filterUsers(users, { ...all, branchId: 'b1', role: 'CASHIER' }).map((u) => u.id),
    ).toEqual(['ana']);
    expect(filterUsers(users, { ...all, search: 'jose perez' }).map((u) => u.id)).toEqual(['jose']);
    expect(filterUsers(users, { ...all, search: 'LUIS@' }).map((u) => u.id)).toEqual(['luis']);
    expect(countUsersByTab(users)).toEqual({ all: 3, ACTIVE: 1, PENDING: 1, INACTIVE: 1 });
  });

  it('ignores blank searches and finds nothing when nothing matches', () => {
    expect(filterUsers(users, { ...all, search: '   ' })).toHaveLength(3);
    expect(filterUsers(users, { ...all, search: 'zzz' })).toEqual([]);
  });
});
