'use client';

import {
  type SystemTopRouteRow,
  type SystemTopRoutesPage,
  systemTopRoutesPageSchema,
} from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { ReportBars } from '@/components/reports/report-bars';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { useSystemReport } from '@/hooks/use-system-report';
import { formatQuetzales } from '@/lib/format';
import { withTotal } from '@/lib/system-reports/grouped-rows';
import { emptyMessageOf } from '@/lib/system-reports/labels';
import { SYSTEM_REPORT_PARAMS } from '@/lib/system-reports/system-report-params';
import { SystemReportFilters } from './system-report-filters';
import { SystemReportHeader } from './system-report-header';
import { topRouteColumns, topRouteRowProps } from './top-routes-report-columns';

export const TOP_ROUTES_REPORT_PATH = '/api/reportes/reports/system-top-routes';

const EMPTY = {
  period: 'Todavía no hay boletos vendidos en este periodo.',
  branch: 'Esa sucursal todavía no ha vendido boletos.',
  none: 'Todavía no hay boletos vendidos.',
};

const highlightsOf = ({ summary }: SystemTopRoutesPage) => [
  { label: 'Rutas', value: summary.totals.routes, tone: 'indigo' as const },
  { label: 'Viajes', value: summary.totals.trips, tone: 'sky' as const },
  { label: 'Boletos', value: summary.totals.tickets, tone: 'mango' as const },
  {
    label: 'Ingresos',
    value: summary.totals.income,
    tone: 'mint' as const,
    format: formatQuetzales,
  },
];

const rowId = (route: SystemTopRouteRow) => route.routeId;

// The routes that sold tickets, from the most to the least demanded, by the day the tickets were
// paid (the same day the income report uses, so the tickets match).
export function TopRoutesReport() {
  const { query, update, report, exportPdf, exporting } = useSystemReport({
    path: TOP_ROUTES_REPORT_PATH,
    fileStem: 'reporte-rutas-demandadas',
    schema: systemTopRoutesPageSchema,
    ...SYSTEM_REPORT_PARAMS,
  });
  const data = report.data;
  const rows = useMemo(() => (data ? withTotal(data, rowId) : []), [data]);

  return (
    <>
      <SystemReportHeader
        title="Rutas más demandadas"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />

      <SystemReportFilters query={query} update={update} branchLabel="Sucursal de origen" />

      {(data || !report.isError) && (
        <ReportHighlights items={data && highlightsOf(data)} placeholders={4} />
      )}

      {data && data.items.length > 0 && (
        <ReportBars
          title="Boletos de las rutas de esta página"
          items={data.items.map((route) => ({
            key: route.routeId,
            label: `${route.originLabel} → ${route.destinationLabel}`,
            value: route.tickets,
          }))}
          format={String}
        />
      )}

      <DataTable
        caption="Rutas más demandadas"
        columns={topRouteColumns}
        data={rows}
        getRowId={(item) => item.id}
        rowProps={topRouteRowProps}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={emptyMessageOf(query, EMPTY)}
        pagination={tablePagination(query, data?.total, update, data?.items.length)}
        minWidth={900}
      />
    </>
  );
}
