import { type Identity, requireBranch } from '@debus/server';
import type { Prisma } from '../generated/prisma/client';

// A driver sees the trips they drive; a branch admin, every trip of the branch.
export function tripAccessWhere(actor: Identity): Prisma.TripWhereInput {
  if (actor.role === 'DRIVER') return { driverId: actor.userId };
  return { branchId: requireBranch(actor) };
}
