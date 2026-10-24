'use client';

import {
  type BranchRepairExpensesPage,
  type BranchRepairExpenseRow,
  branchRepairExpensesPageSchema,
} from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { ExpansionContext, useRowExpansion } from '@/components/data/row-expansion';
import { OPTIONS_PAGE, useOptionSearch } from '@/components/forms/option-search';
import { OptionSelect } from '@/components/forms/option-select';
import { ReportBars } from '@/components/reports/report-bars';
import { ReportFilters } from '@/components/reports/report-filters';
import { ReportHeader } from '@/components/reports/report-header';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { ReportRangeField } from '@/components/reports/report-range-field';
import { useBusesPage } from '@/hooks/use-buses';
import { useExpenseCategoriesPage } from '@/hooks/use-expense-categories';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useReport } from '@/hooks/use-report';
import { useReportPdf } from '@/hooks/use-report-pdf';
import { useUrlQuery } from '@/hooks/use-url-query';
import {
  readRepairReportParams,
  repairReportSearch,
  writeRepairReportParams,
} from '@/lib/branch-reports/repair-report-params';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { RepairCategories, repairReportColumns } from './repair-report-columns';

export const REPAIR_REPORT_PATH = '/api/reportes/reports/branch-repair-expenses';

const highlightsOf = ({ summary }: BranchRepairExpensesPage) => [
  { label: 'Buses', value: summary.totals.buses, tone: 'indigo' as const },
  { label: 'Gastos', value: summary.totals.expenses, tone: 'mango' as const },
  {
    label: 'Total',
    value: summary.totals.total,
    tone: 'coral' as const,
    format: formatQuetzales,
  },
];

const renderDetail = (row: BranchRepairExpenseRow) => <RepairCategories row={row} />;

// What the buses of the branch spent in the workshop, by category and period (every record by
// default); the numbers cover the whole filter and the PDF carries every row of it.
export function RepairReport() {
  const [query, update] = useUrlQuery(readRepairReportParams, writeRepairReportParams);
  const search = useMemo(() => repairReportSearch(query), [query]);
  const report = useReport(REPAIR_REPORT_PATH, search, branchRepairExpensesPageSchema);
  const { exportPdf, exporting } = useReportPdf(REPAIR_REPORT_PATH, search, 'reporte-taller');
  const branch = useOwnBranch();
  const [busSearch, setBusSearch, busTerm] = useOptionSearch();
  const [categorySearch, setCategorySearch, categoryTerm] = useOptionSearch();
  const buses = useBusesPage({
    status: 'all',
    ...(busTerm && { q: busTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const categories = useExpenseCategoriesPage({
    status: 'all',
    ...(categoryTerm && { q: categoryTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const expansion = useRowExpansion();
  usePageInRange(report.data, update);

  const narrowed = Boolean(query.busId || query.categoryId || query.from || query.to);
  const groups = report.data?.summary.groups ?? [];

  return (
    <>
      <ReportHeader
        scope={branch?.name}
        title="Gastos de taller por bus"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!report.data}
      />

      <ReportFilters
        narrowed={narrowed}
        onClear={() =>
          update({ from: undefined, to: undefined, busId: undefined, categoryId: undefined })
        }
      >
        <ReportRangeField
          range={{ from: query.from, to: query.to }}
          onChange={({ from, to }) => update({ from, to })}
        />
        <OptionSelect
          id="repair-report-bus"
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
        <OptionSelect
          id="repair-report-category"
          label="Categoría"
          placeholder="Todas las categorías"
          noneLabel="Todas las categorías"
          options={(categories?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
          total={categories?.total ?? 0}
          value={query.categoryId ?? ''}
          onChange={(categoryId) => update({ categoryId: categoryId || undefined })}
          search={categorySearch}
          onSearchChange={setCategorySearch}
          searchLabel="Buscar categoría"
          emptyMessage="No hay categorías."
        />
      </ReportFilters>

      {(report.data || !report.isError) && (
        <ReportHighlights items={report.data && highlightsOf(report.data)} placeholders={3} />
      )}

      {groups.length > 0 && (
        <ReportBars
          title="Gasto por categoría"
          items={groups.map((group) => ({
            key: group.categoryId,
            label: group.categoryName,
            value: group.amount,
          }))}
          format={formatQuetzales}
        />
      )}

      <ExpansionContext value={expansion}>
        <DataTable
          caption="Gastos de taller por bus"
          columns={repairReportColumns}
          data={report.data?.items ?? []}
          getRowId={(bus) => bus.busId}
          isLoading={report.isPending}
          isRefreshing={report.isPlaceholderData}
          error={report.isError ? 'No pudimos cargar el reporte.' : null}
          onRetry={() => void report.refetch()}
          emptyMessage={
            narrowed
              ? 'No hay gastos de taller con esos filtros.'
              : 'Aún no hay gastos de taller en tu sucursal.'
          }
          pagination={tablePagination(query, report.data?.total, update)}
          expandedRowIds={expansion.expanded}
          renderDetail={renderDetail}
          minWidth={0}
        />
      </ExpansionContext>
    </>
  );
}
