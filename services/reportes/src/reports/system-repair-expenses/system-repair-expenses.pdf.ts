import {
  type SystemRepairExpenseRow,
  type SystemRepairExpensesQuery,
  formatPlate,
} from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatDay, formatMoney, reportPeriod } from '../../common/report-format';
import { branchFilter } from '../system-finance/branch-sections.pdf';
import { groupedSections } from '../system-finance/grouped-sections.pdf';
import {
  REPAIR_KIND_LABELS,
  type RepairCategory,
  type RepairTotals,
} from './system-repair-expenses.rows';

const NO_BUS = 'Bus sin datos';

const COLUMNS: PdfColumn[] = [
  { header: 'Fecha', width: 'auto' },
  { header: 'Sucursal', width: 'auto' },
  { header: 'Bus', width: 'auto' },
  { header: 'Tipo', width: 'auto' },
  { header: 'Descripción', width: '*' },
  { header: 'Monto', width: 'auto', align: 'right' },
];

export interface RepairDocumentInput {
  query: SystemRepairExpensesQuery;
  // The names of the branch and the bus that were chosen, or null when they have no copy.
  branchLabel: string | null;
  busLabel: string | null;
  rows: SystemRepairExpenseRow[];
  totals: RepairTotals;
  groups: RepairCategory[];
  now: Date;
}

export function toReportDocument({
  query,
  branchLabel,
  busLabel,
  rows,
  totals,
  groups,
  now,
}: RepairDocumentInput): ReportDocument {
  return {
    title: 'Gastos de taller por categoría',
    scope: 'Todas las sucursales',
    period: reportPeriod(query.from, query.to),
    filters: [
      ...branchFilter(query.branchId, branchLabel),
      ...(query.busId ? [`Bus: ${busLabel ?? NO_BUS}`] : []),
    ],
    highlights: [
      { label: 'Líneas', value: String(totals.lines) },
      { label: 'Gastos', value: String(totals.expenses) },
      { label: 'Total de taller', value: formatMoney(totals.amount) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows: groupedSections({
          rows,
          groups: groups.map((group) => ({
            key: group.categoryId,
            label: group.categoryName,
            amount: group.amount,
          })),
          keyOf: (row) => row.categoryId,
          columnCount: COLUMNS.length,
          amountColumn: 5,
          cellsOf: (row) => [
            formatDay(row.serviceDate),
            row.branchName,
            row.busPlate ? formatPlate(row.busPlate) : NO_BUS,
            REPAIR_KIND_LABELS[row.kind],
            row.description,
            formatMoney(row.amount),
          ],
          formatAmount: formatMoney,
          subtotalLabel: (label) => `Subtotal ${label}`,
          totalLabel: 'Gran total',
          totalAmount: totals.amount,
        }),
        emptyMessage: 'No hay gastos de taller con esos filtros.',
      },
    ],
    notes: [],
    generatedAt: now,
    landscape: true,
  };
}
