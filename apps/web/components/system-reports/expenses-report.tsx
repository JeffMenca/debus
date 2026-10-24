'use client';

import {
  type SystemExpenseRow,
  type SystemExpensesPage,
  systemExpensesPageSchema,
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
import { expenseColumns, expenseRowProps } from './expenses-report-columns';
import { SystemReportFilters } from './system-report-filters';
import { SystemReportHeader } from './system-report-header';

export const EXPENSES_REPORT_PATH = '/api/reportes/reports/system-expenses';

const EMPTY = {
  period: 'Todavía no hay gastos en este periodo.',
  branch: 'Esa sucursal todavía no tiene gastos.',
  none: 'Todavía no hay gastos registrados.',
};

const highlightsOf = ({ summary }: SystemExpensesPage) => [
  {
    label: 'Gastos totales',
    value: summary.totals.amount,
    tone: 'coral' as const,
    format: formatQuetzales,
    hint: 'Combustible, taller, repuestos y depreciación',
  },
  {
    label: 'Combustible',
    value: summary.totals.fuel,
    tone: 'mango' as const,
    format: formatQuetzales,
  },
  {
    label: 'Depreciación',
    value: summary.totals.depreciation,
    tone: 'lilac' as const,
    format: formatQuetzales,
  },
  { label: 'Taller', value: summary.totals.labor, tone: 'sky' as const, format: formatQuetzales },
  {
    label: 'Repuestos',
    value: summary.totals.parts,
    tone: 'indigo' as const,
    format: formatQuetzales,
  },
];

const rowId = (expense: SystemExpenseRow) => expense.id;

// What every branch spent: fuel and depreciation of its trips, and labor and parts of the
// workshop. The salary of the driver is not an expense here.
export function ExpensesReport() {
  const { query, update, report, exportPdf, exporting } = useSystemReport({
    path: EXPENSES_REPORT_PATH,
    fileStem: 'reporte-gastos',
    schema: systemExpensesPageSchema,
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
        title="Gastos por sucursal"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />

      <SystemReportFilters query={query} update={update} />

      {(data || !report.isError) && (
        <ReportHighlights items={data && highlightsOf(data)} placeholders={5} />
      )}

      {groups.length > 0 && (
        <ReportBars
          title="Gastos de cada sucursal"
          items={groups.map((group) => ({
            key: group.branchId,
            label: group.branchName,
            value: group.amount,
          }))}
          format={formatQuetzales}
        />
      )}

      <DataTable
        caption="Gastos por sucursal"
        columns={expenseColumns}
        data={rows}
        getRowId={(item) => item.id}
        rowProps={expenseRowProps}
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
