import type { ManagedUser, UserRole } from '@debus/contracts';
import { normalizeText } from './normalize';

export type UserTab = 'all' | 'ACTIVE' | 'PENDING' | 'INACTIVE';

export interface UserCriteria {
  tab: UserTab;
  role: UserRole | 'all';
  branchId: string | 'all';
  search: string;
}

export function filterUsers(users: ManagedUser[], criteria: UserCriteria): ManagedUser[] {
  const search = normalizeText(criteria.search);
  return users.filter(
    (user) =>
      (criteria.tab === 'all' || user.status === criteria.tab) &&
      (criteria.role === 'all' || user.role === criteria.role) &&
      (criteria.branchId === 'all' || user.branchId === criteria.branchId) &&
      (!search || normalizeText(`${user.fullName} ${user.email}`).includes(search)),
  );
}

export function countUsersByTab(users: ManagedUser[]): Record<UserTab, number> {
  const count = (status: ManagedUser['status']) =>
    users.filter((user) => user.status === status).length;
  return {
    all: users.length,
    ACTIVE: count('ACTIVE'),
    PENDING: count('PENDING'),
    INACTIVE: count('INACTIVE'),
  };
}
