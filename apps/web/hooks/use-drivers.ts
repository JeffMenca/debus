import {
  type Driver,
  type DriverFields,
  MAX_PAGE_SIZE,
  driverPageSchema,
  driverSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { DriverListView } from '@/lib/fleet/driver-list-params';
import { FLEET_PATH, useInvalidateBusesAndDrivers } from './use-buses';
import { useUploadPhoto } from './use-photo';

export const DRIVERS_PATH = `${FLEET_PATH}/drivers`;

export function useDriversPage(query: DriverListView) {
  return useQuery({
    queryKey: ['drivers', 'page', query],
    queryFn: () => apiRequest(`${DRIVERS_PATH}?${toQueryString({ ...query })}`, driverPageSchema),
    placeholderData: keepPreviousData,
  });
}

// For the driver select of the bus form: the search runs on the server and the list can be long.
export function useDriverOptions(q: string | undefined) {
  return useQuery({
    queryKey: ['drivers', 'options', q ?? ''],
    queryFn: () =>
      apiRequest(
        `${DRIVERS_PATH}?${toQueryString({ pageSize: MAX_PAGE_SIZE, q, status: 'active' })}`,
        driverPageSchema,
      ),
    placeholderData: keepPreviousData,
  });
}

// The panel lists five licences; the total says how many more there are.
const EXPIRING_SHOWN = 5;

// Licences about to expire, soonest first (the branch panel).
export function useExpiringDrivers(days: number) {
  return useQuery({
    queryKey: ['drivers', 'expiring', days],
    queryFn: () =>
      apiRequest(
        `${DRIVERS_PATH}?${toQueryString({
          expiringWithinDays: days,
          page: 1,
          pageSize: EXPIRING_SHOWN,
          status: 'active',
        })}`,
        driverPageSchema,
      ),
  });
}

export function useSaveDriver() {
  const invalidate = useInvalidateBusesAndDrivers();
  return useMutation({
    mutationFn: ({ id, fields }: { id?: string; fields: DriverFields }): Promise<Driver> =>
      apiRequest(id ? `${DRIVERS_PATH}/${id}` : DRIVERS_PATH, driverSchema, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(fields),
      }),
    onSuccess: invalidate,
  });
}

export function useSetDriverActive() {
  const invalidate = useInvalidateBusesAndDrivers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest(`${DRIVERS_PATH}/${id}/${active ? 'reactivate' : 'deactivate'}`, noContent, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
}

export const useUploadDriverPhoto = () => useUploadPhoto(DRIVERS_PATH, 'drivers');
