import { type ScheduleTripRequest, type Trip, tripPageSchema, tripSchema } from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { TripQuery } from '@/lib/fleet/trip-list-params';

export const TRIPS_PATH = '/api/viajes/trips';

// The server filters and pages; the previous page stays on screen while the next one arrives.
export function useTripsPage(query: TripQuery) {
  return useQuery({
    queryKey: ['trips', 'page', query],
    queryFn: () => apiRequest(`${TRIPS_PATH}?${toQueryString({ ...query })}`, tripPageSchema),
    placeholderData: keepPreviousData,
  });
}

export function useScheduleTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: ScheduleTripRequest): Promise<Trip> =>
      apiRequest(TRIPS_PATH, tripSchema, { method: 'POST', body: JSON.stringify(request) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['trips'] }),
  });
}
