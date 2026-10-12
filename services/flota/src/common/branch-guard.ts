import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { FLEET_MESSAGES } from './messages';

export async function assertBranchActive(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<void> {
  const branch = await tx.branchCopy.findUnique({ where: { id: branchId } });
  if (!branch?.active) throw new ConflictException(FLEET_MESSAGES.branchUnavailable);
}
