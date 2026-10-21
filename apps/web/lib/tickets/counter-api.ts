import {
  type CounterSaleRequest,
  type Ticket,
  availableTripPageSchema,
  ticketSchema,
} from '@debus/contracts';
import {
  type QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { CounterQuery } from './counter-list-params';
import { ON_SALE_KEY, VENTAS_PATH } from './trips-api';

const COUNTER_KEY = ['counter'];

// A sale changes the free seats of the counter list and of every seat map.
const refreshSeats = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: COUNTER_KEY }),
    client.invalidateQueries({ queryKey: ON_SALE_KEY }),
  ]);

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
    onSuccess: () => refreshSeats(client),
    // Only a refusal says the seats changed. A lost answer leaves the screen as it was, so the
    // retry sends the same seats with the same key, even if the sale did go through.
    onError: (error) =>
      error instanceof ApiError && error.status === 409 ? refreshSeats(client) : undefined,
  });
}
