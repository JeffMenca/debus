import type { SystemIncomeQuery, SystemIncomeRow } from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatDay, formatMoney, reportPeriod } from '../../common/report-format';
import { branchFilter, branchSections } from '../system-finance/branch-sections.pdf';
import {
  INCOME_CONCEPT_LABELS,
  type IncomeGroup,
  type IncomeTotals,
  incomeDetail,
} from './system-income.rows';

const COLUMNS: PdfColumn[] = [
  { header: 'Fecha de pago', width: 'auto' },
  { header: 'Concepto', width: 'auto' },
  { header: 'Detalle', width: '*' },
  { header: 'Cantidad', width: 'auto', align: 'right' },
  { header: 'Monto', width: 'auto', align: 'right' },
];

const NOTE = 'No incluye boletos de viajes eliminados ni alquileres cancelados: se reembolsan.';

export interface IncomeDocumentInput {
  query: SystemIncomeQuery;
  // The name of the branch that was chosen, or null when it has no copy yet.
  branchLabel: string | null;
  rows: SystemIncomeRow[];
  totals: IncomeTotals;
  groups: IncomeGroup[];
  now: Date;
}

export function toReportDocument({
  query,
  branchLabel,
  rows,
  totals,
  groups,
  now,
}: IncomeDocumentInput): ReportDocument {
  return {
    title: 'Ingresos por sucursal',
    scope: 'Todas las sucursales',
    period: reportPeriod(query.from, query.to),
    filters: branchFilter(query.branchId, branchLabel),
    highlights: [
      { label: 'Registros', value: String(totals.entries) },
      { label: 'Boletos en línea', value: formatMoney(totals.onlineTickets) },
      { label: 'Boletos de ventanilla', value: formatMoney(totals.counterTickets) },
      { label: 'Alquileres', value: formatMoney(totals.rentals) },
      { label: 'Total de ingresos', value: formatMoney(totals.amount) },
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
            INCOME_CONCEPT_LABELS[row.concept],
            incomeDetail(row),
            String(row.quantity),
            formatMoney(row.amount),
          ],
          formatAmount: formatMoney,
          totalLabel: 'Total global',
          totalAmount: totals.amount,
        }),
        emptyMessage: 'No hay ingresos con esos filtros.',
      },
    ],
    notes: [NOTE],
    generatedAt: now,
    landscape: true,
  };
}
