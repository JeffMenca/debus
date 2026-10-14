import { type RentalRequestListQuery, escapeLikePattern } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

export function rentalListWhere(
  branchId: string,
  query: RentalRequestListQuery,
): Prisma.RentalRequestWhereInput {
  return {
    branchId,
    ...(query.status !== 'all' && { status: query.status }),
    ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
  };
}

// The id breaks ties, so a request never shows up on two pages or on none.
export const rentalOrder = (): Prisma.RentalRequestOrderByWithRelationInput[] => [
  { departureAt: 'asc' },
  { id: 'asc' },
];
