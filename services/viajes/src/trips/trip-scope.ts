import { type TripListQuery, escapeLikePattern, guatemalaDayRange } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

// The filters of the query only; who may see which trips is `tripAccessWhere`.
export function tripListWhere(query: TripListQuery): Prisma.TripWhereInput {
  const days = guatemalaDayRange(query.from, query.to);
  return {
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
