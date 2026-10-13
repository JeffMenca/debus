import type { DriverPage } from '@debus/contracts';

// Drivers and routes show the same two tabs, so they share this shape.
type ActiveCounts = DriverPage['summary']['statusCounts'];

// Prisma types a groupBy count inside $transaction([...]) as optional, so read it defensively.
export interface ActiveCountRow {
  active: boolean;
  _count?: true | { _all?: number };
}

export function toActiveCounts(rows: ActiveCountRow[]): ActiveCounts {
  const counts = { active: 0, inactive: 0 };
  for (const row of rows) {
    if (typeof row._count === 'object') {
      counts[row.active ? 'active' : 'inactive'] = row._count._all ?? 0;
    }
  }
  return counts;
}
