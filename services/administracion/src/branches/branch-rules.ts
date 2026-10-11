import type { Identity } from '../identity/identity';

export function canViewBranch(actor: Identity, branchId: string): boolean {
  return actor.role === 'SYSTEM_ADMIN' || (actor.role !== 'CLIENT' && actor.branchId === branchId);
}
