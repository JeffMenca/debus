import type { UserStatus, UserStatusCounts } from '@debus/contracts';

// Prisma types a groupBy count inside $transaction([...]) as optional, so read it defensively.
export interface StatusCountRow {
  status: UserStatus;
  _count?: true | { _all?: number };
}

export function toStatusCounts(rows: StatusCountRow[]): UserStatusCounts {
  const counts: UserStatusCounts = { PENDING: 0, ACTIVE: 0, INACTIVE: 0 };
  for (const row of rows) {
    if (typeof row._count === 'object') counts[row.status] = row._count._all ?? 0;
  }
  return counts;
}
