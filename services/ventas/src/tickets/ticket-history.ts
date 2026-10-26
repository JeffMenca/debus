import { type TicketListQuery, escapeLikePattern, guatemalaDayRange } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

// The history of a client: the tickets bought online and the counter sales linked by their NIT.
// The filters narrow the departure day and the text of the trip.
export function historyWhere(clientId: string, query: TicketListQuery): Prisma.TicketWhereInput {
  const departureAt = guatemalaDayRange(query.from, query.to);
  const trip: Prisma.TripWhereInput = {
    ...(Object.keys(departureAt).length > 0 && { departureAt }),
    ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
  };
  return { clientId, ...(Object.keys(trip).length > 0 && { trip }) };
}

export const nextTripWhere = (clientId: string, now: Date): Prisma.TicketWhereInput => ({
  clientId,
  trip: { departureAt: { gt: now } },
});
