'use client';

import {
  type BranchBusesPage,
  BUS_DISPLAY_STATUSES,
  type BusDisplayStatus,
  SEARCH_MAX_LENGTH,
  branchBusesPageSchema,
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
  busReportSearch,
  readBusReportParams,
  writeBusReportParams,
} from '@/lib/branch-reports/bus-report-params';
import { inputRules } from '@/lib/forms/input-rules';
import { busReportColumns } from './bus-report-columns';

export const BUSES_REPORT_PATH = '/api/reportes/reports/branch-buses';

const TAB_LABELS: Record<BusDisplayStatus, string> = {
  IN_TRANSIT: 'En ruta',
  AVAILABLE: 'Disponibles',
  IN_WORKSHOP: 'En taller',
  INACTIVE: 'Inactivos',
};

const highlightsOf = ({ summary }: BranchBusesPage) => [
  { label: 'Buses', value: summary.totals.buses, tone: 'indigo' as const },
  { label: 'Viajes realizados', value: summary.totals.completedTrips, tone: 'mint' as const },
];

// The buses of the branch with the status, driver and mileage of each one; the numbers cover the
// whole filter and the PDF carries every row of it.
export function BusesReport() {
  const [query, update] = useUrlQuery(readBusReportParams, writeBusReportParams);
  const search = useMemo(() => busReportSearch(query), [query]);
  const report = useReport(BUSES_REPORT_PATH, search, branchBusesPageSchema);
  const { exportPdf, exporting } = useReportPdf(BUSES_REPORT_PATH, search, 'reporte-buses');
  const branch = useOwnBranch();
  const [typed, setTyped] = useUrlSearch(query.q, update);
  usePageInRange(report.data, update);

  const counts = report.data?.summary.groups;
  const countOf = (status: BusDisplayStatus) =>
    counts?.find((group) => group.status === status)?.buses;
  const everyBus = counts?.reduce((sum, group) => sum + group.buses, 0);
  const narrowed = Boolean(query.q) || query.status !== 'all';

  return (
    <>
      <ReportHeader
        scope={branch?.name}
        title="Listado de buses"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!report.data}
      />

      <ReportFilters narrowed={narrowed} onClear={() => update({ status: 'all', q: undefined })}>
        <div className="col-span-full">
          <StatusTabs
            label="Estado de los buses"
            value={query.status}
            onChange={(status: typeof query.status) => update({ status })}
            options={[
              { value: 'all', label: 'Todos', count: everyBus },
              ...BUS_DISPLAY_STATUSES.map((status) => ({
                value: status,
                label: TAB_LABELS[status],
                count: countOf(status),
              })),
            ]}
          />
        </div>
        <div className="sm:col-span-2">
          <Field id="buses-report-search" label="Buscar">
            <Input
              id="buses-report-search"
              icon={Search}
              rule={inputRules.text(SEARCH_MAX_LENGTH)}
              placeholder="Placa, marca o modelo"
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
        caption="Buses"
        columns={busReportColumns}
        data={report.data?.items ?? []}
        getRowId={(bus) => bus.busId}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay buses con esos filtros.'
            : 'Aún no hay buses registrados en tu sucursal.'
        }
        pagination={tablePagination(query, report.data?.total, update)}
        minWidth={900}
      />
    </>
  );
}
