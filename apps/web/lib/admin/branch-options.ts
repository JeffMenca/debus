import type { Branch, UserRole } from '@debus/contracts';

export type BranchOption = Pick<Branch, 'id' | 'name' | 'active'>;

// Only a branch admin may be placed in a closed branch: it is how a closed branch gets its admin
// back before it is reactivated. Everyone else works in open branches.
export function branchesFor(role: UserRole | undefined, branches: BranchOption[]): BranchOption[] {
  return role === 'BRANCH_ADMIN' ? branches : branches.filter((branch) => branch.active);
}

export function branchLabel(branch: BranchOption): string {
  return branch.active ? branch.name : `${branch.name} (inactiva)`;
}
