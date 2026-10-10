import type { AccountLinkPurpose, UserRole } from '@debus/contracts';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';
export type LinkState = 'valid' | 'expired' | 'used' | 'invalid';

export interface Actor {
  role: UserRole;
  branchId: string | null;
}

const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const LINK_TTL_MS: Record<AccountLinkPurpose, number> = {
  ACTIVATION: 48 * HOUR_MS,
  PASSWORD_RESET: HOUR_MS,
};
export const MAX_LINKS_PER_HOUR = 3;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function canCreateRole(
  actor: Actor,
  target: { role: UserRole; branchId?: string | null },
): boolean {
  if (actor.role === 'SYSTEM_ADMIN') return true;
  if (actor.role !== 'BRANCH_ADMIN' || !actor.branchId) return false;
  return (
    (target.role === 'CASHIER' || target.role === 'DRIVER') && target.branchId === actor.branchId
  );
}

export function canDeactivate(
  target: { role: UserRole; status: UserStatus },
  activeSystemAdmins: number,
): boolean {
  return !(target.role === 'SYSTEM_ADMIN' && target.status === 'ACTIVE' && activeSystemAdmins <= 1);
}

export function linkState(
  link: { expiresAt: Date; usedAt: Date | null } | null,
  now: Date,
): LinkState {
  if (!link) return 'invalid';
  if (link.usedAt) return 'used';
  return link.expiresAt > now ? 'valid' : 'expired';
}

// Only the expiry lives here: counting attempts and setting the lock happen in one SQL statement
// (SessionsService.reserveAttempt), so concurrent logins cannot race on the count.
export function lockExpiry(now: Date): Date {
  return new Date(now.getTime() + LOCK_MINUTES * MINUTE_MS);
}

// An account nobody created (the first system admin) is still an invitation, not a self sign up.
export function activationReason(user: {
  createdById: string | null;
  role: UserRole;
}): 'INVITATION' | 'SIGNUP' {
  return user.createdById || user.role !== 'CLIENT' ? 'INVITATION' : 'SIGNUP';
}

export function canSendNotice(lastNoticeAt: Date | null, now: Date): boolean {
  return !lastNoticeAt || now.getTime() - lastNoticeAt.getTime() >= HOUR_MS;
}
