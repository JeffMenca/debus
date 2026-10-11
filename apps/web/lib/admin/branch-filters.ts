import type { Branch } from '@debus/contracts';
import { normalizeText } from './normalize';

export type BranchTab = 'active' | 'inactive' | 'all';

export function filterBranches(branches: Branch[], tab: BranchTab, search: string): Branch[] {
  const text = normalizeText(search);
  return branches.filter(
    (branch) =>
      (tab === 'all' || branch.active === (tab === 'active')) &&
      (!text ||
        normalizeText(
          `${branch.name} ${branch.code} ${branch.municipality} ${branch.department}`,
        ).includes(text)),
  );
}

export function countBranchesByTab(branches: Branch[]): Record<BranchTab, number> {
  const active = branches.filter((branch) => branch.active).length;
  return { active, inactive: branches.length - active, all: branches.length };
}
