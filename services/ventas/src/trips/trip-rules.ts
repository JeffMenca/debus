import {
  type AvailableTripListQuery,
  type TripScheduledPayload,
  escapeLikePattern,
  foldSearchText,
  guatemalaDayRange,
} from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';

export type TripOnSale = TripScheduledPayload & { routeId: string; ticketPrice: number };

// Only regular trips sell seats; a rental is paid as a whole and has no ticket price.
export const isOnSale = (trip: TripScheduledPayload): trip is TripOnSale =>
  trip.type === 'REGULAR' && trip.ticketPrice !== null && trip.routeId !== null;

export function toTripRow(trip: TripOnSale) {
  return {
    tripId: trip.tripId,
    branchId: trip.branchId,
    routeId: trip.routeId,
    busId: trip.busId,
    busPlate: trip.busPlate,
    originLabel: trip.originLabel,
    destinationLabel: trip.destinationLabel,
    capacity: trip.capacity,
    ticketPrice: trip.ticketPrice,
    departureAt: trip.departureAt,
    estimatedArrivalAt: trip.estimatedArrivalAt,
    searchText: foldSearchText(`${trip.originLabel} ${trip.destinationLabel} ${trip.busPlate}`),
  };
}

// A trip is on sale until its scheduled departure; the filters narrow the day, the places, the
// text and the free seats. A counter only sells the trips leaving from its own branch. The
// conditions read the trip as t and its taken seats as s (see TripsService).
export function onSaleConditions(
  query: AvailableTripListQuery,
  now: Date,
  branchId?: string,
): Prisma.Sql {
  const { gte, lt } = guatemalaDayRange(query.from, query.to);
  const conditions = [
    Prisma.sql`t.departure_at > ${now}`,
    gte && Prisma.sql`t.departure_at >= ${gte}`,
    lt && Prisma.sql`t.departure_at < ${lt}`,
    branchId && Prisma.sql`t.branch_id = ${branchId}::uuid`,
    query.origin && Prisma.sql`t.origin_label = ${query.origin}`,
    query.destination && Prisma.sql`t.destination_label = ${query.destination}`,
    query.q && Prisma.sql`t.search_text LIKE ${`%${escapeLikePattern(query.q)}%`}`,
    query.seats && Prisma.sql`t.capacity - COALESCE(s.taken, 0) >= ${query.seats}`,
  ].filter((condition): condition is Prisma.Sql => Boolean(condition));
  return Prisma.join(conditions, ' AND ');
}
