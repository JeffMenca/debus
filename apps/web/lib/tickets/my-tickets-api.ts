import { type PageQuery, ticketPageSchema } from '@debus/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import { VENTAS_PATH } from './trips-api';

export const MY_TICKETS_KEY = ['my-tickets'];

// The tickets of the client, also the counter sales made with their NIT, with the next trip.
export function useMyTickets(query: PageQuery) {
  return useQuery({
    queryKey: [...MY_TICKETS_KEY, query],
    queryFn: () =>
      apiRequest(`${VENTAS_PATH}/tickets?${toQueryString({ ...query })}`, ticketPageSchema),
    placeholderData: keepPreviousData,
  });
}
