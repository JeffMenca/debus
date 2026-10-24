import { type SystemExpenseRow, type SystemExpensesQuery, formatPlate } from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatDay, formatMoney, reportPeriod } from '../../common/report-format';
import { branchFilter, branchSections } from '../system-finance/branch-sections.pdf';
import {
  EXPENSE_CONCEPT_LABELS,
  type ExpenseGroup,
  type ExpenseTotals,
  expenseDetail,
} from './system-expenses.rows';

const COLUMNS: PdfColumn[] = [
  { header: 'Fecha', width: 'auto' },
  { header: 'Concepto', width: 'auto' },
  { header: 'Bus', width: 'auto' },
  { header: 'Detalle', width: '*' },
  { header: 'Monto', width: 'auto', align: 'right' },
];

const NOTE =
  'Incluye combustible, depreciación, mano de obra y repuestos. No incluye el salario de los choferes.';
const NO_BUS = 'Bus sin datos';

export interface ExpensesDocumentInput {
  query: SystemExpensesQuery;
  // The name of the branch that was chosen, or null when it has no copy yet.
  branchLabel: string | null;
  rows: SystemExpenseRow[];
  totals: ExpenseTotals;
  groups: ExpenseGroup[];
  now: Date;
}

export function toReportDocument({
  query,
  branchLabel,
  rows,
  totals,
  groups,
  now,
}: ExpensesDocumentInput): ReportDocument {
  return {
    title: 'Gastos por sucursal',
    scope: 'Todas las sucursales',
    period: reportPeriod(query.from, query.to),
    filters: branchFilter(query.branchId, branchLabel),
    highlights: [
      { label: 'Registros', value: String(totals.entries) },
      { label: 'Combustible', value: formatMoney(totals.fuel) },
      { label: 'Depreciación', value: formatMoney(totals.depreciation) },
      { label: 'Mano de obra', value: formatMoney(totals.labor) },
      { label: 'Repuestos', value: formatMoney(totals.parts) },
      { label: 'Total de gastos', value: formatMoney(totals.amount) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows: branchSections({
          rows,
          groups,
          columnCount: COLUMNS.length,
          amountColumn: 4,
          cellsOf: (row) => [
            formatDay(row.day),
            EXPENSE_CONCEPT_LABELS[row.concept],
            row.busPlate ? formatPlate(row.busPlate) : NO_BUS,
            expenseDetail(row),
            formatMoney(row.amount),
          ],
          formatAmount: formatMoney,
          totalLabel: 'Total global',
          totalAmount: totals.amount,
        }),
        emptyMessage: 'No hay gastos con esos filtros.',
      },
    ],
    notes: [NOTE],
    generatedAt: now,
    landscape: true,
  };
}
