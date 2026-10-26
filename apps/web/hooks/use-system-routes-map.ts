import { systemRoutesMapSchema } from '@debus/contracts';
import { useMemo } from 'react';
import { routesMapSearch } from '@/lib/system-reports/routes-map-params';
import { useReport } from './use-report';

export const SYSTEM_ROUTES_MAP_PATH = '/api/reportes/reports/system-routes-map';

// Every branch with where it is, and the active routes of one of them; with no branch the server
// picks the first one that has routes.
export function useSystemRoutesMap(branchId: string | undefined) {
  const search = useMemo(() => routesMapSearch(branchId), [branchId]);
  return useReport(SYSTEM_ROUTES_MAP_PATH, search, systemRoutesMapSchema);
}
