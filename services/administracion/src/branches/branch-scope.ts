import { type BranchListQuery, type BranchStatusCounts, escapeLikePattern } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';
import type { Identity } from '../identity/identity';

const STATUS_WHERE = { active: { active: true }, inactive: { active: false }, all: {} } as const;

const search = (q: string | undefined): Prisma.BranchWhereInput =>
  q ? { searchText: { contains: escapeLikePattern(q) } } : {};

// Only a system admin sees inactive branches; everyone else always gets the active ones.
export function branchListWhere(actor: Identity, query: BranchListQuery): Prisma.BranchWhereInput {
  const status = actor.role === 'SYSTEM_ADMIN' ? STATUS_WHERE[query.status] : STATUS_WHERE.active;
  return { ...status, ...search(query.q) };
}

// The numbers on the status tabs ignore the selected tab, so switching tabs keeps them still.
export function branchCountWhere(actor: Identity, query: BranchListQuery): Prisma.BranchWhereInput {
  return actor.role === 'SYSTEM_ADMIN' ? search(query.q) : branchListWhere(actor, query);
}

// Prisma types a groupBy count inside $transaction([...]) as optional, so read it defensively.
export interface ActiveCountRow {
  active: boolean;
  _count?: true | { _all?: number };
}

export function toBranchStatusCounts(rows: ActiveCountRow[]): BranchStatusCounts {
  const counts = { active: 0, inactive: 0 };
  for (const row of rows) {
    if (typeof row._count === 'object') {
      counts[row.active ? 'active' : 'inactive'] = row._count._all ?? 0;
    }
  }
  return counts;
}
