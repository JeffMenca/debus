'use client';

import {
  type SystemIncomePage,
  type SystemIncomeRow,
  systemIncomePageSchema,
} from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { ReportBars } from '@/components/reports/report-bars';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { useSystemReport } from '@/hooks/use-system-report';
import { formatQuetzales } from '@/lib/format';
import { withSubtotals } from '@/lib/system-reports/grouped-rows';
import { emptyMessageOf } from '@/lib/system-reports/labels';
import { SYSTEM_REPORT_PARAMS } from '@/lib/system-reports/system-report-params';
import { incomeColumns, incomeRowProps } from './income-report-columns';
import { SystemReportFilters } from './system-report-filters';
import { SystemReportHeader } from './system-report-header';

export const INCOME_REPORT_PATH = '/api/reportes/reports/system-income';

const EMPTY = {
  period: 'Todavía no hay ingresos en este periodo.',
  branch: 'Esa sucursal todavía no tiene ingresos.',
  none: 'Todavía no hay ingresos registrados.',
};

const highlightsOf = ({ summary }: SystemIncomePage) => [
  {
    label: 'Ingresos totales',
    value: summary.totals.amount,
    tone: 'mint' as const,
    format: formatQuetzales,
    hint: 'Boletos y alquileres',
  },
  {
    label: 'Boletos en línea',
    value: summary.totals.onlineTickets,
    tone: 'indigo' as const,
    format: formatQuetzales,
  },
  {
    label: 'Boletos de ventanilla',
    value: summary.totals.counterTickets,
    tone: 'mango' as const,
    format: formatQuetzales,
  },
  {
    label: 'Alquileres',
    value: summary.totals.rentals,
    tone: 'coral' as const,
    format: formatQuetzales,
  },
];

const rowId = (sale: SystemIncomeRow) => sale.id;

// Every sale (a ticket or a paid rental) of every branch, by the day it was paid and every record
// by default; the numbers cover the whole filter and the PDF carries every row of it.
export function IncomeReport() {
  const { query, update, report, exportPdf, exporting } = useSystemReport({
    path: INCOME_REPORT_PATH,
    fileStem: 'reporte-ingresos',
    schema: systemIncomePageSchema,
    ...SYSTEM_REPORT_PARAMS,
  });
  const data = report.data;
  const rows = useMemo(
    () =>
      data
        ? withSubtotals(data, {
            rowId,
            groupId: (group) => group.branchId,
            groupSize: (group) => group.entries,
          })
        : [],
    [data],
  );
  const groups = data?.summary.groups ?? [];

  return (
    <>
      <SystemReportHeader
        title="Ingresos por sucursal"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />

      <SystemReportFilters query={query} update={update} />

      {(data || !report.isError) && (
        <ReportHighlights items={data && highlightsOf(data)} placeholders={4} />
      )}

      {groups.length > 0 && (
        <ReportBars
          title="Ingresos de cada sucursal"
          items={groups.map((group) => ({
            key: group.branchId,
            label: group.branchName,
            value: group.amount,
          }))}
          format={formatQuetzales}
        />
      )}

      <DataTable
        caption="Ingresos por sucursal"
        columns={incomeColumns}
        data={rows}
        getRowId={(item) => item.id}
        rowProps={incomeRowProps}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={emptyMessageOf(query, EMPTY)}
        pagination={tablePagination(query, data?.total, update, data?.items.length)}
        minWidth={820}
      />
    </>
  );
}
