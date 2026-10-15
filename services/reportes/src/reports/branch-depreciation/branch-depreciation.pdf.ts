import {
  type BranchDepreciationQuery,
  type BranchDepreciationRow,
  formatPlate,
} from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatKm, formatMoney, reportPeriod } from '../../common/report-format';
import type { DepreciationTotals } from './branch-depreciation.rows';

const COLUMNS: PdfColumn[] = [
  { header: 'Placa', width: 'auto' },
  { header: 'Bus', width: '*' },
  { header: 'Viajes', width: 'auto', align: 'right' },
  { header: 'Km recorridos', width: 'auto', align: 'right' },
  { header: 'Monto por km aplicado', width: 'auto', align: 'right' },
  { header: 'Depreciación acumulada', width: 'auto', align: 'right' },
];

const NOTE =
  'La depreciación de cada viaje se fija con el monto vigente el día de su llegada; cambiar el monto no altera viajes anteriores.';

export interface DepreciationDocumentInput {
  branchName: string | null;
  query: BranchDepreciationQuery;
  rows: BranchDepreciationRow[];
  totals: DepreciationTotals;
  now: Date;
}

export function toReportDocument({
  branchName,
  query,
  rows,
  totals,
  now,
}: DepreciationDocumentInput): ReportDocument {
  const lines = rows.map((row) => ({
    cells: [
      formatPlate(row.plate),
      `${row.brand} ${row.model}`,
      String(row.completedTrips),
      formatKm(row.kmTraveled),
      row.appliedPerKm === null ? '—' : formatMoney(row.appliedPerKm),
      formatMoney(row.accumulated),
    ],
  }));
  const total = {
    cells: ['Total', '', '', formatKm(totals.kmTraveled), '', formatMoney(totals.accumulated)],
    tone: 'total' as const,
  };

  return {
    title: 'Depreciación por bus',
    scope: branchName ? `Sucursal ${branchName}` : 'Sucursal',
    period: reportPeriod(query.from, query.to),
    filters: query.q ? [`Búsqueda: ${query.q}`] : [],
    highlights: [
      { label: 'Km recorridos', value: formatKm(totals.kmTraveled) },
      { label: 'Depreciación acumulada', value: formatMoney(totals.accumulated) },
      {
        label: 'Monto por km vigente hoy',
        value: totals.currentPerKm === null ? 'Sin configurar' : formatMoney(totals.currentPerKm),
      },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows: lines.length > 0 ? [...lines, total] : [],
        emptyMessage: 'No hay buses con esos filtros.',
      },
    ],
    notes: [NOTE],
    generatedAt: now,
    landscape: false,
  };
}
