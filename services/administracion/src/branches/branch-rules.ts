import type { UserRole } from '@debus/contracts';
import type { Identity } from '../identity/identity';

export function canViewBranch(actor: Identity, branchId: string): boolean {
  return actor.role === 'SYSTEM_ADMIN' || (actor.role !== 'CLIENT' && actor.branchId === branchId);
}

// A branch admin may join an inactive branch: that is how one left without admin gets one back
// before it can be reactivated. Every other role works only in active branches.
export function canLinkToBranch(role: UserRole, branch: { active: boolean } | null): boolean {
  return branch !== null && (branch.active || role === 'BRANCH_ADMIN');
}
