import type { Identity } from '@debus/server';
import { type UserListQuery, escapeLikePattern } from '@debus/contracts';
import type { Prisma, UserRole } from '../generated/prisma/client';

// The filters a list may carry; paging is not part of who can be seen.
type UserFilters = Partial<UserListQuery>;

const STAFF_MANAGED_BY_BRANCH: UserRole[] = ['CASHIER', 'DRIVER'];

function search(q: string | undefined): Prisma.UserWhereInput {
  return q ? { searchText: { contains: escapeLikePattern(q) } } : {};
}

// A requested role is the finer filter, so it wins over the group.
function roleFilter(query: UserFilters): Prisma.UserWhereInput {
  if (query.role) return { role: query.role };
  if (query.group === 'staff') return { role: { not: 'CLIENT' } };
  if (query.group === 'clients') return { role: 'CLIENT' };
  return {};
}

function branchAdminRole(requested: UserRole | undefined): Prisma.UserWhereInput['role'] {
  if (!requested) return { in: STAFF_MANAGED_BY_BRANCH };
  return STAFF_MANAGED_BY_BRANCH.includes(requested) ? requested : { in: [] };
}

// System admins see everyone; a branch admin only sees the cashiers and drivers of their branch.
export function userListWhere(actor: Identity, query: UserFilters): Prisma.UserWhereInput {
  const status = query.status && { status: query.status };
  if (actor.role === 'SYSTEM_ADMIN') {
    return {
      ...roleFilter(query),
      ...status,
      ...(query.branchId && { branchId: query.branchId }),
      ...search(query.q),
    };
  }
  return {
    branchId: actor.branchId,
    role: branchAdminRole(query.role),
    ...status,
    ...search(query.q),
  };
}

// The numbers on the status tabs ignore the selected tab, so switching tabs keeps them still.
export function userCountWhere(actor: Identity, query: UserFilters): Prisma.UserWhereInput {
  return userListWhere(actor, { ...query, status: undefined });
}
