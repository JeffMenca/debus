import {
  type RecordArrivalRequest,
  type RecordDepartureRequest,
  tripDetailSchema,
} from '@debus/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { TRIPS_PATH } from './use-trips';

const detailKey = (id: string) => ['trips', 'detail', id] as const;

export function useTrip(id: string) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => apiRequest(`${TRIPS_PATH}/${id}`, tripDetailSchema),
  });
}

// The server answers with the whole detail, so the screen swaps to it without asking again.
function useTripRecord<T>(id: string, step: 'departure' | 'arrival') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: T) =>
      apiRequest(`${TRIPS_PATH}/${id}/${step}`, tripDetailSchema, {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: (detail) => {
      client.setQueryData(detailKey(id), detail);
      return client.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

export const useRecordDeparture = (id: string) =>
  useTripRecord<RecordDepartureRequest>(id, 'departure');
export const useRecordArrival = (id: string) => useTripRecord<RecordArrivalRequest>(id, 'arrival');

export function useDeleteTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`${TRIPS_PATH}/${id}`, noContent, { method: 'DELETE' }),
    onSuccess: (_result, id) => {
      // The trip is gone: asking for it again would only bring a 404 to the screen on its way out.
      client.removeQueries({ queryKey: detailKey(id) });
      // A deleted rental goes back to the list of rentals waiting for a bus.
      return Promise.all([
        client.invalidateQueries({ queryKey: ['trips'] }),
        client.invalidateQueries({ queryKey: ['rental-requests'] }),
      ]);
    },
  });
}
