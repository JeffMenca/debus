import type { SystemProfitQuery, SystemProfitRow } from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatMoney, formatPercent, reportPeriod } from '../../common/report-format';
import { branchFilter } from '../system-finance/branch-sections.pdf';
import type { ProfitTotals } from './system-profit.rows';

const money = (header: string): PdfColumn => ({ header, width: 'auto', align: 'right' });
const COLUMNS: PdfColumn[] = [
  { header: 'Sucursal', width: '*' },
  money('Boletos'),
  money('Alquileres'),
  money('Ingresos'),
  money('Combustible'),
  money('Mano de obra'),
  money('Repuestos'),
  money('Depreciación'),
  money('Gastos'),
  money('Ganancia neta'),
  money('Margen'),
];

const NOTES = [
  'Los ingresos se fechan por el día de pago, el taller por la fecha del servicio y el combustible y la depreciación por el día de llegada del viaje.',
  'No incluye el salario de los choferes.',
];

type Figures = Omit<SystemProfitRow, 'branchId' | 'branchName'>;
const figureCells = (figures: Figures): string[] => [
  formatMoney(figures.ticketIncome),
  formatMoney(figures.rentalIncome),
  formatMoney(figures.income),
  formatMoney(figures.fuel),
  formatMoney(figures.labor),
  formatMoney(figures.parts),
  formatMoney(figures.depreciation),
  formatMoney(figures.expenses),
  formatMoney(figures.profit),
  formatPercent(figures.margin),
];

export interface ProfitDocumentInput {
  query: SystemProfitQuery;
  // The name of the branch that was chosen, or null when it has no copy yet.
  branchLabel: string | null;
  rows: SystemProfitRow[];
  totals: ProfitTotals;
  now: Date;
}

export function toReportDocument({
  query,
  branchLabel,
  rows,
  totals,
  now,
}: ProfitDocumentInput): ReportDocument {
  return {
    title: 'Ganancias por sucursal',
    scope: 'Todas las sucursales',
    period: reportPeriod(query.from, query.to),
    filters: branchFilter(query.branchId, branchLabel),
    highlights: [
      { label: 'Ingresos', value: formatMoney(totals.income) },
      { label: 'Gastos', value: formatMoney(totals.expenses) },
      { label: 'Ganancia neta', value: formatMoney(totals.profit) },
      { label: 'Margen', value: formatPercent(totals.margin) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows:
          rows.length > 0
            ? [
                ...rows.map((row) => ({ cells: [row.branchName, ...figureCells(row)] })),
                { cells: ['Total', ...figureCells(totals)], tone: 'total' as const },
              ]
            : [],
        emptyMessage: 'No hay sucursales con esos filtros.',
      },
    ],
    notes: NOTES,
    generatedAt: now,
    landscape: true,
  };
}
