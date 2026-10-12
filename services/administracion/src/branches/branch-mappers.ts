import type { Branch, BranchChangedPayload, BranchWithAdmins } from '@debus/contracts';
import type { Branch as BranchRow, Prisma } from '../generated/prisma/client';

export const WITH_ADMINS = {
  users: {
    where: { role: 'BRANCH_ADMIN' },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true, status: true },
  },
} satisfies Prisma.BranchInclude;
export type BranchRowWithAdmins = Prisma.BranchGetPayload<{ include: typeof WITH_ADMINS }>;

function fields(row: BranchRow) {
  return {
    code: row.code,
    name: row.name,
    department: row.department as Branch['department'],
    municipality: row.municipality,
    address: row.address,
    phone: row.phone,
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
  };
}

export function toBranch(row: BranchRow): Branch {
  return { id: row.id, ...fields(row), active: row.active, version: row.version };
}

export function toBranchWithAdmins(row: BranchRowWithAdmins): BranchWithAdmins {
  return { ...toBranch(row), admins: row.users };
}

export function toBranchPayload(row: BranchRow): BranchChangedPayload {
  return { branchId: row.id, ...fields(row), active: row.active, version: row.version };
}
