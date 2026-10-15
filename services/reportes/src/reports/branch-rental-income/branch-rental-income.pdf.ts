import {
  type BranchRentalIncomeQuery,
  type BranchRentalIncomeRow,
  formatPlate,
} from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatDay, formatInstant, formatMoney, reportPeriod } from '../../common/report-format';
import type { RentalIncomeTotals } from './branch-rental-income.rows';

const COLUMNS: PdfColumn[] = [
  { header: 'Cliente', width: '*' },
  { header: 'Origen', width: 'auto' },
  { header: 'Destino', width: 'auto' },
  { header: 'Salida', width: 'auto' },
  { header: 'Regreso', width: 'auto' },
  { header: 'Pagado el', width: 'auto' },
  { header: 'Bus', width: 'auto' },
  { header: 'Pasajeros', width: 'auto', align: 'right' },
  { header: 'Precio', width: 'auto', align: 'right' },
];

export interface RentalIncomeDocumentInput {
  branchName: string | null;
  query: BranchRentalIncomeQuery;
  rows: BranchRentalIncomeRow[];
  totals: RentalIncomeTotals;
  now: Date;
}

export function toReportDocument({
  branchName,
  query,
  rows,
  totals,
  now,
}: RentalIncomeDocumentInput): ReportDocument {
  const lines = rows.map((row) => ({
    cells: [
      `${row.clientName} (NIT ${row.nit})`,
      row.originLabel,
      row.destinationLabel,
      formatInstant(row.departureAt),
      row.returnAt ? formatInstant(row.returnAt) : 'Solo ida',
      formatDay(row.paidOn),
      row.busPlate ? formatPlate(row.busPlate) : 'Por asignar',
      String(row.passengers),
      formatMoney(row.price),
    ],
  }));
  const passengers = rows.reduce((sum, row) => sum + row.passengers, 0);
  const total = {
    cells: ['Total', '', '', '', '', '', '', String(passengers), formatMoney(totals.income)],
    tone: 'total' as const,
  };

  return {
    title: 'Ingresos por alquiler de buses',
    scope: branchName ? `Sucursal ${branchName}` : 'Sucursal',
    period: reportPeriod(query.from, query.to),
    filters: query.q ? [`Búsqueda: ${query.q}`] : [],
    highlights: [
      { label: 'Alquileres', value: String(totals.rentals) },
      { label: 'Ingresos', value: formatMoney(totals.income) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows: lines.length > 0 ? [...lines, total] : [],
        emptyMessage: 'No hay alquileres pagados con esos filtros.',
      },
    ],
    notes: [],
    generatedAt: now,
    landscape: true,
  };
}
