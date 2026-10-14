import {
  type AssignRentalRequest,
  type Trip,
  rentalRequestPageSchema,
  tripSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { RentalQuery } from '@/lib/trips/rental-list-params';

export const RENTAL_REQUESTS_PATH = '/api/viajes/rental-requests';

// The rentals already paid that wait for a bus and a driver; the server filters and pages.
export function useRentalRequestsPage(query: RentalQuery) {
  return useQuery({
    queryKey: ['rental-requests', 'page', query],
    queryFn: () =>
      apiRequest(`${RENTAL_REQUESTS_PATH}?${toQueryString({ ...query })}`, rentalRequestPageSchema),
    placeholderData: keepPreviousData,
  });
}

// Assigning creates the trip, so the trips list and the rentals still waiting both change.
export function useAssignRental(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: AssignRentalRequest): Promise<Trip> =>
      apiRequest(`${RENTAL_REQUESTS_PATH}/${id}/assignment`, tripSchema, {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['trips'] }),
        client.invalidateQueries({ queryKey: ['rental-requests'] }),
      ]),
  });
}
