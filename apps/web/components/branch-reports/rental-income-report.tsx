'use client';

import {
  type BranchRentalIncomePage,
  SEARCH_MAX_LENGTH,
  branchRentalIncomePageSchema,
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
  readRentalIncomeReportParams,
  rentalIncomeReportSearch,
  writeRentalIncomeReportParams,
} from '@/lib/branch-reports/rental-income-report-params';
import { formatQuetzales } from '@/lib/format';
import { rentalIncomeReportColumns } from './rental-income-report-columns';

export const RENTAL_INCOME_REPORT_PATH = '/api/reportes/reports/branch-rental-income';

const highlightsOf = ({ summary }: BranchRentalIncomePage) => [
  { label: 'Alquileres', value: summary.totals.rentals, tone: 'indigo' as const },
  {
    label: 'Ingresos',
    value: summary.totals.income,
    tone: 'coral' as const,
    format: formatQuetzales,
  },
];

// What the rentals confirmed by the branch brought in, by the day they were paid (every record by
// default); the numbers cover the whole filter and the PDF carries every row of it.
export function RentalIncomeReport() {
  const [query, update] = useUrlQuery(readRentalIncomeReportParams, writeRentalIncomeReportParams);
  const search = useMemo(() => rentalIncomeReportSearch(query), [query]);
  const report = useReport(RENTAL_INCOME_REPORT_PATH, search, branchRentalIncomePageSchema);
  const { exportPdf, exporting } = useReportPdf(
    RENTAL_INCOME_REPORT_PATH,
    search,
    'reporte-ingresos-alquileres',
  );
  const branch = useOwnBranch();
  const [typed, setTyped] = useUrlSearch(query.q, update);
  usePageInRange(report.data, update);

  const narrowed = Boolean(query.q || query.from || query.to);

  return (
    <>
      <ReportHeader
        scope={branch?.name}
        title="Ingresos por alquiler"
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
          <Field id="rental-income-report-search" label="Buscar">
            <Input
              id="rental-income-report-search"
              icon={Search}
              maxLength={SEARCH_MAX_LENGTH}
              placeholder="Cliente, NIT o destino"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </div>
      </ReportFilters>

      {(report.data || !report.isError) && (
        <ReportHighlights items={report.data && highlightsOf(report.data)} placeholders={2} />
      )}

      <DataTable
        caption="Ingresos por alquiler"
        columns={rentalIncomeReportColumns}
        data={report.data?.items ?? []}
        getRowId={(rental) => rental.rentalId}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay alquileres pagados con esos filtros.'
            : 'Aún no hay alquileres pagados.'
        }
        pagination={tablePagination(query, report.data?.total, update)}
        minWidth={960}
      />
    </>
  );
}
