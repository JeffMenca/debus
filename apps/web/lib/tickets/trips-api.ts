import { availableTripPageSchema, seatMapSchema, tripPlacesSchema } from '@debus/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import { type TripSearch, toTripListQuery } from './trip-search-params';

export const VENTAS_PATH = '/api/ventas';
// Everything a sale changes: the free seats of the list and the map. Online and counter sales both
// refresh it.
export const ON_SALE_KEY = ['on-sale'];
const ONE_MINUTE = 60_000;

// The server filters and pages; the previous page stays on screen while the next one arrives.
export function useTripsOnSale(search: TripSearch) {
  const query = toTripListQuery(search);
  return useQuery({
    queryKey: [...ON_SALE_KEY, 'trips', query],
    queryFn: () =>
      apiRequest(`${VENTAS_PATH}/trips?${toQueryString(query)}`, availableTripPageSchema),
    placeholderData: keepPreviousData,
  });
}

export function useTripPlaces() {
  return useQuery({
    queryKey: [...ON_SALE_KEY, 'places'],
    queryFn: () => apiRequest(`${VENTAS_PATH}/trips/places`, tripPlacesSchema),
    staleTime: ONE_MINUTE,
  });
}

// Without a trip (an address that is not one) nothing is asked.
export function useSeatMap(tripId: string | null) {
  return useQuery({
    queryKey: [...ON_SALE_KEY, 'seats', tripId],
    queryFn: () => apiRequest(`${VENTAS_PATH}/trips/${tripId}/seats`, seatMapSchema),
    enabled: tripId !== null,
  });
}
