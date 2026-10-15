'use client';

import { type BranchTicketIncomePage, branchTicketIncomePageSchema } from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { OPTIONS_PAGE, useOptionSearch } from '@/components/forms/option-search';
import { OptionSelect } from '@/components/forms/option-select';
import { ReportBars } from '@/components/reports/report-bars';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportHeader } from '@/components/reports/report-header';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { ReportRangeField } from '@/components/reports/report-range-field';
import { useBusesPage } from '@/hooks/use-buses';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useReport } from '@/hooks/use-report';
import { useReportPdf } from '@/hooks/use-report-pdf';
import { useRoutesPage } from '@/hooks/use-routes';
import { useUrlQuery } from '@/hooks/use-url-query';
import {
  type TicketIncomeReportView,
  readTicketIncomeReportParams,
  ticketIncomeReportSearch,
  writeTicketIncomeReportParams,
} from '@/lib/branch-reports/ticket-income-report-params';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { ticketIncomeReportColumns } from './ticket-income-report-columns';

export const TICKET_INCOME_REPORT_PATH = '/api/reportes/reports/branch-ticket-income';

const NOTE = 'No incluye boletos de viajes eliminados: se reembolsan.';

const highlightsOf = ({ summary }: BranchTicketIncomePage) => [
  { label: 'Viajes', value: summary.totals.trips, tone: 'indigo' as const },
  { label: 'Boletos', value: summary.totals.tickets, tone: 'mango' as const },
  {
    label: 'Ingresos',
    value: summary.totals.income,
    tone: 'mint' as const,
    format: formatQuetzales,
  },
];

function emptyMessageOf(query: TicketIncomeReportView, narrowed: boolean): string {
  if (query.from || query.to) return 'No hay ingresos por boletos en ese periodo.';
  if (narrowed) return 'No hay ingresos por boletos con esos filtros.';
  return 'Aún no hay boletos vendidos en tu sucursal.';
}

// What the tickets sold for the trips of the branch brought in, by the day they were paid (every
// record by default); the numbers cover the whole filter and the PDF carries every row of it.
export function TicketIncomeReport() {
  const [query, update] = useUrlQuery(readTicketIncomeReportParams, writeTicketIncomeReportParams);
  const search = useMemo(() => ticketIncomeReportSearch(query), [query]);
  const report = useReport(TICKET_INCOME_REPORT_PATH, search, branchTicketIncomePageSchema);
  const { exportPdf, exporting } = useReportPdf(
    TICKET_INCOME_REPORT_PATH,
    search,
    'reporte-ingresos-boletos',
  );
  const branch = useOwnBranch();
  const [routeSearch, setRouteSearch, routeTerm] = useOptionSearch();
  const [busSearch, setBusSearch, busTerm] = useOptionSearch();
  const routes = useRoutesPage({
    status: 'all',
    ...(routeTerm && { q: routeTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const buses = useBusesPage({
    status: 'all',
    ...(busTerm && { q: busTerm }),
    ...OPTIONS_PAGE,
  }).data;
  usePageInRange(report.data, update);

  const narrowed = Boolean(query.routeId || query.busId || query.from || query.to);
  const groups = report.data?.summary.groups ?? [];

  return (
    <>
      <ReportHeader
        scope={branch?.name}
        title="Ingresos por boletos"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!report.data}
      />

      <ReportFilters
        narrowed={narrowed}
        onClear={() =>
          update({ from: undefined, to: undefined, routeId: undefined, busId: undefined })
        }
      >
        <ReportRangeField
          range={{ from: query.from, to: query.to }}
          onChange={({ from, to }) => update({ from, to })}
        />
        <OptionSelect
          id="ticket-income-report-route"
          label="Ruta"
          placeholder="Todas las rutas"
          noneLabel="Todas las rutas"
          options={(routes?.items ?? []).map((item) => ({
            value: item.id,
            label: `${item.originName} → ${item.destinationName}`,
          }))}
          total={routes?.total ?? 0}
          value={query.routeId ?? ''}
          onChange={(routeId) => update({ routeId: routeId || undefined })}
          search={routeSearch}
          onSearchChange={setRouteSearch}
          searchLabel="Buscar ruta"
          emptyMessage="No hay rutas registradas."
        />
        <OptionSelect
          id="ticket-income-report-bus"
          label="Bus"
          placeholder="Todos los buses"
          noneLabel="Todos los buses"
          options={(buses?.items ?? []).map((item) => ({
            value: item.id,
            label: formatPlate(item.plate),
          }))}
          total={buses?.total ?? 0}
          value={query.busId ?? ''}
          onChange={(busId) => update({ busId: busId || undefined })}
          search={busSearch}
          onSearchChange={setBusSearch}
          searchLabel="Buscar bus"
          emptyMessage="No hay buses registrados."
        />
      </ReportFilters>

      {(report.data || !report.isError) && (
        <ReportHighlights items={report.data && highlightsOf(report.data)} placeholders={3} />
      )}

      {groups.length > 0 && (
        <ReportBars
          title="Ingresos por ruta"
          items={groups.map((group) => ({
            key: group.routeId,
            label: `${group.originLabel} → ${group.destinationLabel}`,
            value: group.income,
          }))}
          format={formatQuetzales}
        />
      )}

      <DataTable
        caption="Ingresos por boletos"
        columns={ticketIncomeReportColumns}
        data={report.data?.items ?? []}
        getRowId={(trip) => trip.tripId}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={emptyMessageOf(query, narrowed)}
        pagination={tablePagination(query, report.data?.total, update)}
        footerNote={<span>{NOTE}</span>}
        minWidth={820}
      />
    </>
  );
}
