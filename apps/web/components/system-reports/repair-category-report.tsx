'use client';

import {
  type SystemRepairExpenseRow,
  type SystemRepairExpensesPage,
  systemRepairExpensesPageSchema,
} from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { OptionSelect } from '@/components/forms/option-select';
import { useOptionSearch } from '@/components/forms/option-search';
import { ReportBars } from '@/components/reports/report-bars';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { useSystemBusOptions } from '@/hooks/use-system-bus-options';
import { useSystemReport } from '@/hooks/use-system-report';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { withSubtotals } from '@/lib/system-reports/grouped-rows';
import { emptyMessageOf } from '@/lib/system-reports/labels';
import {
  type RepairCategoryView,
  readRepairCategoryParams,
  repairCategorySearch,
  writeRepairCategoryParams,
} from '@/lib/system-reports/repair-category-report-params';
import { repairCategoryColumns, repairCategoryRowProps } from './repair-category-report-columns';
import { SystemReportFilters } from './system-report-filters';
import { SystemReportHeader } from './system-report-header';

export const REPAIR_CATEGORY_REPORT_PATH = '/api/reportes/reports/system-repair-expenses';

const EMPTY = {
  period: 'Todavía no hay gastos de taller en este periodo.',
  branch: 'Esa sucursal todavía no tiene gastos de taller.',
  none: 'Todavía no hay gastos de taller registrados.',
};

const highlightsOf = ({ summary }: SystemRepairExpensesPage) => [
  {
    label: 'Gasto total',
    value: summary.totals.amount,
    tone: 'coral' as const,
    format: formatQuetzales,
  },
  { label: 'Líneas', value: summary.totals.lines, tone: 'indigo' as const },
  { label: 'Gastos de taller', value: summary.totals.expenses, tone: 'mango' as const },
];

const rowId = (line: SystemRepairExpenseRow) => `${line.expenseId}:${line.lineNo}`;

// What the workshops spent, line by line, under the category of each line; the buses to filter by
// are those of every branch, searched on the server.
export function RepairCategoryReport() {
  const { query, update, report, exportPdf, exporting } = useSystemReport({
    path: REPAIR_CATEGORY_REPORT_PATH,
    fileStem: 'reporte-taller',
    schema: systemRepairExpensesPageSchema,
    read: readRepairCategoryParams,
    write: writeRepairCategoryParams,
    toSearch: repairCategorySearch,
  });
  const [busSearch, setBusSearch, busTerm] = useOptionSearch();
  const buses = useSystemBusOptions({
    ...(query.branchId && { branchId: query.branchId }),
    ...(busTerm && { q: busTerm }),
  }).data;
  const data = report.data;
  const rows = useMemo(
    () =>
      data
        ? withSubtotals(data, {
            rowId,
            groupId: (group) => group.categoryId,
            groupSize: (group) => group.lines,
          })
        : [],
    [data],
  );
  const groups = data?.summary.groups ?? [];

  // A bus belongs to one branch, so choosing another branch lets go of the bus.
  const updateFilters = (patch: Partial<RepairCategoryView>) =>
    update('branchId' in patch ? { ...patch, busId: undefined } : patch);

  return (
    <>
      <SystemReportHeader
        title="Gastos de taller por categoría"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />

      <SystemReportFilters
        query={query}
        update={updateFilters}
        narrowed={Boolean(query.busId)}
        extraClear={{ busId: undefined }}
      >
        <OptionSelect
          id="system-report-bus"
          label="Bus"
          placeholder="Todos los buses"
          noneLabel="Todos los buses"
          options={(buses?.items ?? []).map((bus) => ({
            value: bus.id,
            label: `${formatPlate(bus.plate)} · ${bus.branchName}`,
          }))}
          total={buses?.total ?? 0}
          value={query.busId ?? ''}
          onChange={(busId) => update({ busId: busId || undefined })}
          search={busSearch}
          onSearchChange={setBusSearch}
          searchLabel="Buscar bus"
          emptyMessage="No hay buses registrados."
        />
      </SystemReportFilters>

      {(data || !report.isError) && (
        <ReportHighlights items={data && highlightsOf(data)} placeholders={3} />
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

      <DataTable
        caption="Gastos de taller por categoría"
        columns={repairCategoryColumns}
        data={rows}
        getRowId={(item) => item.id}
        rowProps={repairCategoryRowProps}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage={
          query.busId ? 'Ese bus todavía no tiene gastos de taller.' : emptyMessageOf(query, EMPTY)
        }
        pagination={tablePagination(query, data?.total, update, data?.items.length)}
        minWidth={900}
      />
    </>
  );
}
