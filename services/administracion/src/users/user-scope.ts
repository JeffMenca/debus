import type { UserListQuery } from '@debus/contracts';
import type { Prisma, UserRole } from '../generated/prisma/client';
import type { Identity } from '../identity/identity';

const STAFF_MANAGED_BY_BRANCH: UserRole[] = ['CASHIER', 'DRIVER'];

function search(q: string | undefined): Prisma.UserWhereInput {
  if (!q) return {};
  return {
    OR: [
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  };
}

function branchAdminRole(requested: UserRole | undefined): Prisma.UserWhereInput['role'] {
  if (!requested) return { in: STAFF_MANAGED_BY_BRANCH };
  return STAFF_MANAGED_BY_BRANCH.includes(requested) ? requested : { in: [] };
}

// System admins see everyone; a branch admin only sees the cashiers and drivers of their branch.
export function userListWhere(actor: Identity, query: UserListQuery): Prisma.UserWhereInput {
  const status = query.status && { status: query.status };
  if (actor.role === 'SYSTEM_ADMIN') {
    return {
      ...(query.role && { role: query.role }),
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
