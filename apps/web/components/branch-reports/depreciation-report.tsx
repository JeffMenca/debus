'use client';

import {
  type BranchDepreciationPage,
  SEARCH_MAX_LENGTH,
  branchDepreciationPageSchema,
} from '@debus/contracts';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportHeader } from '@/components/reports/report-header';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { ReportRangeField } from '@/components/reports/report-range-field';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useReport } from '@/hooks/use-report';
import { useReportPdf } from '@/hooks/use-report-pdf';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import {
  depreciationReportSearch,
  readDepreciationReportParams,
  writeDepreciationReportParams,
} from '@/lib/branch-reports/depreciation-report-params';
import { formatKm, formatQuetzales } from '@/lib/format';
import { depreciationReportColumns } from './depreciation-report-columns';

export const DEPRECIATION_REPORT_PATH = '/api/reportes/reports/branch-depreciation';

const NOTE =
  'La depreciación de cada viaje se fija con el monto vigente el día de su llegada; cambiar el monto no altera viajes anteriores.';

const highlightsOf = ({ summary }: BranchDepreciationPage) => {
  const { kmTraveled, accumulated, currentPerKm } = summary.totals;
  return [
    { label: 'Km recorridos', value: kmTraveled, tone: 'indigo' as const, format: formatKm },
    {
      label: 'Depreciación acumulada',
      value: accumulated,
      tone: 'mint' as const,
      format: formatQuetzales,
    },
    {
      label: 'Monto por km vigente hoy',
      value: currentPerKm ?? 0,
      tone: 'mango' as const,
      format: currentPerKm === null ? () => 'Sin configurar' : formatQuetzales,
    },
  ];
};

// What each bus depreciated in a period (every record by default); the numbers cover the whole
// filter and the PDF carries every row of it.
export function DepreciationReport() {
  const [query, update] = useUrlQuery(readDepreciationReportParams, writeDepreciationReportParams);
  const search = useMemo(() => depreciationReportSearch(query), [query]);
  const report = useReport(DEPRECIATION_REPORT_PATH, search, branchDepreciationPageSchema);
  const { exportPdf, exporting } = useReportPdf(
    DEPRECIATION_REPORT_PATH,
    search,
    'reporte-depreciacion',
  );
  const branch = useOwnBranch();
  const [typed, setTyped] = useUrlSearch(query.q, update);
  usePageInRange(report.data, update);

  const narrowed = Boolean(query.q || query.from || query.to);

  return (
    <>
      <ReportHeader
        scope={branch?.name}
        title="Depreciación por bus"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!report.data}
      />

      <ReportFilters
        narrowed={narrowed}
        onClear={() => update({ from: undefined, to: undefined, q: undefined })}
      >
        <ReportRangeField
          range={{ from: query.from, to: query.to }}
          onChange={({ from, to }) => update({ from, to })}
        />
        <div className="sm:col-span-2">
          <Field id="depreciation-report-search" label="Buscar">
            <Input
              id="depreciation-report-search"
              icon={Search}
              maxLength={SEARCH_MAX_LENGTH}
              placeholder="Placa, marca o modelo"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </div>
      </ReportFilters>

      {(report.data || !report.isError) && (
        <ReportHighlights items={report.data && highlightsOf(report.data)} placeholders={3} />
      )}

      <DataTable
        caption="Depreciación por bus"
        columns={depreciationReportColumns}
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
        footerNote={<span>{NOTE}</span>}
        minWidth={860}
      />
    </>
  );
}
