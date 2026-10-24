'use client';

import {
  type SystemProfitPage,
  type SystemProfitRow,
  systemProfitPageSchema,
} from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { ExpansionContext, useRowExpansion } from '@/components/data/row-expansion';
import { ReportBars } from '@/components/reports/report-bars';
import { ReportHighlights } from '@/components/reports/report-highlights';
import { useSystemReport } from '@/hooks/use-system-report';
import { formatPercent, formatQuetzales } from '@/lib/format';
import { withTotal } from '@/lib/system-reports/grouped-rows';
import { emptyMessageOf } from '@/lib/system-reports/labels';
import { SYSTEM_REPORT_PARAMS } from '@/lib/system-reports/system-report-params';
import {
  type ProfitTableRow,
  ProfitBreakdown,
  profitColumns,
  profitRowProps,
} from './profit-report-columns';
import { SystemReportFilters } from './system-report-filters';
import { SystemReportHeader } from './system-report-header';

export const PROFIT_REPORT_PATH = '/api/reportes/reports/system-profit';

const EMPTY = {
  period: 'Todavía no hay movimientos en este periodo.',
  branch: 'Esa sucursal todavía no tiene movimientos.',
  none: 'Todavía no hay sucursales con movimientos.',
};

const highlightsOf = ({ summary }: SystemProfitPage) => [
  {
    label: 'Ingresos',
    value: summary.totals.income,
    tone: 'mint' as const,
    format: formatQuetzales,
    hint: 'Boletos y alquileres',
  },
  {
    label: 'Gastos',
    value: summary.totals.expenses,
    tone: 'coral' as const,
    format: formatQuetzales,
    hint: 'Combustible, taller, repuestos y depreciación',
  },
  {
    label: 'Ganancia neta',
    value: summary.totals.profit,
    tone: 'indigo' as const,
    format: formatQuetzales,
    hint: `Margen ${formatPercent(summary.totals.margin)}`,
  },
];

const rowId = (branch: SystemProfitRow) => branch.branchId;

const renderDetail = (item: ProfitTableRow) =>
  item.kind === 'row' ? <ProfitBreakdown branch={item.row} /> : null;

// Income minus expenses of each branch, with the whole of them at the end; each branch opens to
// show where the money came from and where it went.
export function ProfitReport() {
  const { query, update, report, exportPdf, exporting } = useSystemReport({
    path: PROFIT_REPORT_PATH,
    fileStem: 'reporte-ganancias',
    schema: systemProfitPageSchema,
    ...SYSTEM_REPORT_PARAMS,
  });
  const expansion = useRowExpansion();
  const data = report.data;
  const rows = useMemo(() => (data ? withTotal(data, rowId) : []), [data]);

  return (
    <>
      <SystemReportHeader
        title="Ganancias"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />

      <SystemReportFilters query={query} update={update} />

      {(data || !report.isError) && (
        <ReportHighlights items={data && highlightsOf(data)} placeholders={3} />
      )}

      {data && data.items.length > 0 && (
        <ReportBars
          title="Ganancia neta por sucursal"
          items={data.items.map((branch) => ({
            key: branch.branchId,
            label: branch.branchName,
            value: branch.profit,
          }))}
          format={formatQuetzales}
        />
      )}

      <ExpansionContext value={expansion}>
        <DataTable
          caption="Ganancias por sucursal"
          columns={profitColumns}
          data={rows}
          getRowId={(item) => item.id}
          rowProps={profitRowProps}
          isLoading={report.isPending}
          isRefreshing={report.isPlaceholderData}
          error={report.isError ? 'No pudimos cargar el reporte.' : null}
          onRetry={() => void report.refetch()}
          emptyMessage={emptyMessageOf(query, EMPTY)}
          pagination={tablePagination(query, data?.total, update, data?.items.length)}
          expandedRowIds={expansion.expanded}
          renderDetail={renderDetail}
          minWidth={640}
        />
      </ExpansionContext>
    </>
  );
}
