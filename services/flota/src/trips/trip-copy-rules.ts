import type { TripCopyStatus } from '../generated/prisma/client';

export const STATUS_RANK: Record<TripCopyStatus, number> = {
  SCHEDULED: 1,
  IN_TRANSIT: 2,
  COMPLETED: 3,
};

export const advancesStatus = (current: TripCopyStatus | null, next: TripCopyStatus): boolean =>
  current === null || STATUS_RANK[next] > STATUS_RANK[current];
