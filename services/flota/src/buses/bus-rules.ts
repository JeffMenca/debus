import type { BusDisplayStatus, BusStatusCounts } from '@debus/contracts';
import type { BusOperationalStatus, Prisma, TripCopyStatus } from '../generated/prisma/client';

interface BusState {
  active: boolean;
  inTransit: boolean;
  operationalStatus: BusOperationalStatus;
}

export function busDisplayStatus(bus: BusState): BusDisplayStatus {
  if (!bus.active) return 'INACTIVE';
  if (bus.inTransit) return 'IN_TRANSIT';
  return bus.operationalStatus;
}

const WHERE: Record<BusDisplayStatus, Prisma.BusWhereInput> = {
  INACTIVE: { active: false },
  IN_TRANSIT: { active: true, inTransit: true },
  IN_WORKSHOP: { active: true, inTransit: false, operationalStatus: 'IN_WORKSHOP' },
  AVAILABLE: { active: true, inTransit: false, operationalStatus: 'AVAILABLE' },
};

export const displayStatusWhere = (status: BusDisplayStatus): Prisma.BusWhereInput => WHERE[status];

// Prisma types a groupBy count inside $transaction([...]) as optional, so read it defensively.
export interface BusCountRow extends BusState {
  _count?: true | { _all?: number };
}

export function toStatusCounts(rows: BusCountRow[]): BusStatusCounts {
  const counts: BusStatusCounts = { IN_TRANSIT: 0, AVAILABLE: 0, IN_WORKSHOP: 0, INACTIVE: 0 };
  for (const row of rows) {
    if (typeof row._count === 'object') counts[busDisplayStatus(row)] += row._count._all ?? 0;
  }
  return counts;
}

export const hasPendingTrips = (trips: { status: TripCopyStatus }[]): boolean =>
  trips.some((trip) => trip.status !== 'COMPLETED');

export const canAssignDriver = (
  bus: { branchId: string },
  driver: { branchId: string; active: boolean },
): boolean => driver.active && driver.branchId === bus.branchId;

// Completed trips raise the mileage on their own; an old form must not take it back.
export const mileageProblem = (currentKm: number, nextKm: number): 'mileageDecrease' | null =>
  nextKm < currentKm ? 'mileageDecrease' : null;
