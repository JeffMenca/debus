'use client';

import {
  type BranchDriversPage,
  SEARCH_MAX_LENGTH,
  branchDriversPageSchema,
} from '@debus/contracts';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportHeader } from '@/components/reports/report-header';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useReport } from '@/hooks/use-report';
import { useReportPdf } from '@/hooks/use-report-pdf';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import {
  driverReportSearch,
  readDriverReportParams,
  writeDriverReportParams,
} from '@/lib/branch-reports/driver-report-params';
import { driverReportColumns } from './driver-report-columns';

export const DRIVERS_REPORT_PATH = '/api/reportes/reports/branch-drivers';

const highlightsOf = ({ summary }: BranchDriversPage) => [
  { label: 'Choferes', value: summary.totals.drivers, tone: 'indigo' as const },
  { label: 'Viajes realizados', value: summary.totals.completedTrips, tone: 'mint' as const },
];

// The drivers of the branch with the state of their licence; the numbers cover the whole filter and
// the PDF carries every row of it.
export function DriversReport() {
  const [query, update] = useUrlQuery(readDriverReportParams, writeDriverReportParams);
  const search = useMemo(() => driverReportSearch(query), [query]);
  const report = useReport(DRIVERS_REPORT_PATH, search, branchDriversPageSchema);
  const { exportPdf, exporting } = useReportPdf(DRIVERS_REPORT_PATH, search, 'reporte-choferes');
  const branch = useOwnBranch();
  const [typed, setTyped] = useUrlSearch(query.q, update);
  usePageInRange(report.data, update);

  const counts = report.data?.summary.groups;
  const countOf = (active: boolean) => counts?.find((group) => group.active === active)?.drivers;
  const everyDriver = counts?.reduce((sum, group) => sum + group.drivers, 0);
  const narrowed = Boolean(query.q) || query.status !== 'all';

  return (
    <>
      <ReportHeader
        scope={branch?.name}
        title="Listado de choferes"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!report.data}
      />

      <ReportFilters narrowed={narrowed} onClear={() => update({ status: 'all', q: undefined })}>
        <div className="col-span-full">
          <StatusTabs
            label="Estado de los choferes"
            value={query.status}
            onChange={(status: typeof query.status) => update({ status })}
            options={[
              { value: 'all', label: 'Todos', count: everyDriver },
              { value: 'active', label: 'Activos', count: countOf(true) },
              { value: 'inactive', label: 'Inactivos', count: countOf(false) },
            ]}
          />
        </div>
        <div className="sm:col-span-2">
          <Field id="drivers-report-search" label="Buscar">
            <Input
              id="drivers-report-search"
              icon={Search}
              maxLength={SEARCH_MAX_LENGTH}
              placeholder="Nombre o licencia"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </div>
      </ReportFilters>

      {(report.data || !report.isError) && (
        <ReportHighlights items={report.data && highlightsOf(report.data)} />
      )}

      <DataTable
        caption="Choferes"
        columns={driverReportColumns}
        data={report.data?.items ?? []}
        getRowId={(driver) => driver.driverId}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay choferes con esos filtros.'
            : 'Aún no hay choferes registrados en tu sucursal.'
        }
        pagination={tablePagination(query, report.data?.total, update)}
        minWidth={820}
      />
    </>
  );
}
