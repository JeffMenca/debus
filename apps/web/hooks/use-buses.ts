import { type Bus, type BusFields, busPageSchema, busSchema } from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { BusListView } from '@/lib/fleet/bus-list-params';
import { useUploadPhoto } from './use-photo';

export const FLEET_PATH = '/api/flota';
export const BUSES_PATH = `${FLEET_PATH}/buses`;

// The server filters and pages; the previous page stays on screen while the next one arrives.
export function useBusesPage(query: BusListView) {
  return useQuery({
    queryKey: ['buses', 'page', query],
    queryFn: () => apiRequest(`${BUSES_PATH}?${toQueryString({ ...query })}`, busPageSchema),
    placeholderData: keepPreviousData,
  });
}

// The counts come with a one-row page: the summary covers the whole fleet, not the page.
export function useBusCounts() {
  return useQuery({
    queryKey: ['buses', 'counts'],
    queryFn: () =>
      apiRequest(`${BUSES_PATH}?${toQueryString({ page: 1, pageSize: 1 })}`, busPageSchema),
    select: (page) => page.summary.statusCounts,
  });
}

// A bus shows its driver and a driver shows their bus, so both lists refresh together.
export function useInvalidateBusesAndDrivers() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['buses'] }),
      client.invalidateQueries({ queryKey: ['drivers'] }),
    ]);
}

export function useSaveBus() {
  const invalidate = useInvalidateBusesAndDrivers();
  return useMutation({
    mutationFn: ({ id, fields }: { id?: string; fields: BusFields }): Promise<Bus> =>
      apiRequest(id ? `${BUSES_PATH}/${id}` : BUSES_PATH, busSchema, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(fields),
      }),
    onSuccess: invalidate,
  });
}

export function useSetBusActive() {
  const invalidate = useInvalidateBusesAndDrivers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest(`${BUSES_PATH}/${id}/${active ? 'reactivate' : 'deactivate'}`, noContent, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
}

export const useUploadBusPhoto = () => useUploadPhoto(BUSES_PATH, 'buses');
