import {
  type CounterSaleRequest,
  type Ticket,
  availableTripPageSchema,
  seatMapSchema,
  ticketSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { CounterQuery } from './counter-list-params';

const VENTAS_PATH = '/api/ventas';
const COUNTER_KEY = ['counter'];

// The server filters, pages and keeps only the trips leaving from the branch of whoever sells.
export function useCounterTrips(query: CounterQuery) {
  return useQuery({
    queryKey: [...COUNTER_KEY, 'trips', query],
    queryFn: () =>
      apiRequest(
        `${VENTAS_PATH}/counter/trips?${toQueryString({ ...query })}`,
        availableTripPageSchema,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useSeatMap(tripId: string) {
  return useQuery({
    queryKey: [...COUNTER_KEY, 'seats', tripId],
    queryFn: () => apiRequest(`${VENTAS_PATH}/trips/${tripId}/seats`, seatMapSchema),
  });
}

export interface CounterSale {
  // One key per sale: sending it again (a retry) never sells the seats twice.
  key: string;
  request: CounterSaleRequest;
}

export function useCounterSale() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, request }: CounterSale): Promise<Ticket> =>
      apiRequest(`${VENTAS_PATH}/counter/tickets`, ticketSchema, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'idempotency-key': key },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: COUNTER_KEY }),
    // Only a refusal says the seats changed. A lost answer leaves the screen as it was, so the
    // retry sends the same seats with the same key, even if the sale did go through.
    onError: (error) =>
      error instanceof ApiError && error.status === 409
        ? client.invalidateQueries({ queryKey: COUNTER_KEY })
        : undefined,
  });
}
