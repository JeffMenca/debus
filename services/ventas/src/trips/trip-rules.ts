import {
  type AvailableTripListQuery,
  type TripScheduledPayload,
  escapeLikePattern,
  foldSearchText,
  guatemalaDayRange,
} from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

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

// A trip is on sale until its scheduled departure; the filters narrow the departure day and text.
// A counter only sells the trips leaving from its own branch.
export function onSaleWhere(
  query: AvailableTripListQuery,
  now: Date,
  branchId?: string,
): Prisma.TripWhereInput {
  return {
    departureAt: { gt: now, ...guatemalaDayRange(query.from, query.to) },
    ...(branchId && { branchId }),
    ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
  };
}
