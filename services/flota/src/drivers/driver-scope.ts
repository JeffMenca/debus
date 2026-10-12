import { type DriverListQuery, escapeLikePattern } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

const STATUS = { active: { active: true }, inactive: { active: false }, all: {} } as const;
const DAY_MS = 86_400_000;

const search = (q: string | undefined): Prisma.DriverWhereInput =>
  q ? { searchText: { contains: escapeLikePattern(q) } } : {};

// `today` is the Guatemalan date (todayInGuatemala), so the window does not shift at midnight UTC.
export function driverListWhere(
  branchId: string,
  query: DriverListQuery,
  today: string,
): Prisma.DriverWhereInput {
  return {
    branchId,
    ...STATUS[query.status],
    ...search(query.q),
    ...(query.expiringWithinDays && {
      licenseExpiresOn: {
        lte: new Date(Date.parse(`${today}T00:00:00.000Z`) + query.expiringWithinDays * DAY_MS),
      },
    }),
  };
}

// The numbers on the tabs ignore the selected tab, so switching tabs keeps them still.
export const driverCountWhere = (
  branchId: string,
  query: DriverListQuery,
): Prisma.DriverWhereInput => ({ branchId, ...search(query.q) });

export const driverOrder = (query: DriverListQuery): Prisma.DriverOrderByWithRelationInput[] =>
  query.expiringWithinDays
    ? [{ licenseExpiresOn: 'asc' }, { id: 'asc' }]
    : [{ fullName: 'asc' }, { id: 'asc' }];
