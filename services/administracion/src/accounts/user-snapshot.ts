import type { UserUpdatedPayload } from '@debus/contracts';
import type { User } from '../generated/prisma/client';

// The account as the copies of other services keep it (UserUpdated). Only an active account counts:
// a pending one has never signed in.
export function toUserUpdated(user: User): UserUpdatedPayload {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    branchId: user.branchId,
    active: user.status === 'ACTIVE',
    version: user.version,
  };
}
