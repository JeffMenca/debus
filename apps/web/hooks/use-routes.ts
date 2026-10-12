import {
  type CreateRouteRequest,
  type Route,
  type UpdateRouteRequest,
  routePageSchema,
  routeSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, noContent } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { RouteListView } from '@/lib/fleet/route-list-params';
import { FLEET_PATH } from './use-buses';

export const ROUTES_PATH = `${FLEET_PATH}/routes`;

export function useRoutesPage(query: RouteListView) {
  return useQuery({
    queryKey: ['routes', 'page', query],
    queryFn: () => apiRequest(`${ROUTES_PATH}?${toQueryString({ ...query })}`, routePageSchema),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateRoutes() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['routes'] });
}

type SaveRoute =
  { id?: undefined; input: CreateRouteRequest } | { id: string; input: UpdateRouteRequest };

// A route is created with its destination and edited with its distance, price and whether it is open.
export function useSaveRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation({
    mutationFn: ({ id, input }: SaveRoute): Promise<Route> =>
      apiRequest(id ? `${ROUTES_PATH}/${id}` : ROUTES_PATH, routeSchema, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteRoute() {
  const invalidate = useInvalidateRoutes();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`${ROUTES_PATH}/${id}`, noContent, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
