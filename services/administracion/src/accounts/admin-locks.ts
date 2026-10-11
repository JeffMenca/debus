import type { Prisma } from '../generated/prisma/client';

// Rows are always locked in the same order, so two transactions can never wait on each other.
export async function lockActiveSystemAdmins(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE role = 'SYSTEM_ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
}

export async function lockBranchAdmins(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE role = 'BRANCH_ADMIN' AND branch_id = ${branchId}::uuid AND status <> 'INACTIVE' ORDER BY id FOR UPDATE`;
}
