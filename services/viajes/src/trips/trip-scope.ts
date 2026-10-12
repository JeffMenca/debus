import { type TripListQuery, escapeLikePattern, guatemalaDayRange } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

export function tripListWhere(branchId: string, query: TripListQuery): Prisma.TripWhereInput {
  const days = guatemalaDayRange(query.from, query.to);
  return {
    branchId,
    ...(Object.keys(days).length > 0 && { departureAt: days }),
    ...(query.status !== 'all' && { status: query.status }),
    ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
  };
}

// The id breaks ties, so a trip never shows up on two pages or on none.
export const tripOrder = (): Prisma.TripOrderByWithRelationInput[] => [
  { departureAt: 'asc' },
  { id: 'asc' },
];
