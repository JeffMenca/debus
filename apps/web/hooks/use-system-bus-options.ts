import { MAX_PAGE_SIZE, systemBusOptionsPageSchema } from '@debus/contracts';
import { useMemo } from 'react';
import { reportSearch } from '@/lib/reports/search';
import { useReport } from './use-report';

export const SYSTEM_BUS_OPTIONS_PATH = '/api/reportes/reports/system-bus-options';

// The buses of every branch for the select of a report: `flota` only answers the administrator of
// one branch, so `reportes` lists them for the system administrator, searching on the server.
export function useSystemBusOptions({ branchId, q }: { branchId?: string; q?: string }) {
  const search = useMemo(
    () => reportSearch({ branchId, q, page: 1, pageSize: MAX_PAGE_SIZE }),
    [branchId, q],
  );
  return useReport(SYSTEM_BUS_OPTIONS_PATH, search, systemBusOptionsPageSchema);
}
