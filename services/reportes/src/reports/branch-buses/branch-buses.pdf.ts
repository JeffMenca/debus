import {
  type BranchBusRow,
  type BranchBusesQuery,
  type BusDisplayStatus,
  formatPlate,
} from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatKm } from '../../common/report-format';
import type { BusTotals } from './branch-buses.rows';

export const BUS_STATUS_LABELS: Record<BusDisplayStatus, string> = {
  IN_TRANSIT: 'En ruta',
  AVAILABLE: 'Disponible',
  IN_WORKSHOP: 'En taller',
  INACTIVE: 'Inactivo',
};

const COLUMNS: PdfColumn[] = [
  { header: 'Placa', width: 'auto' },
  { header: 'Marca', width: '*' },
  { header: 'Modelo', width: '*' },
  { header: 'Capacidad', width: 'auto', align: 'right' },
  { header: 'Estado', width: 'auto' },
  { header: 'Chofer asignado', width: '*' },
  { header: 'Kilometraje', width: 'auto', align: 'right' },
  { header: 'Viajes realizados', width: 'auto', align: 'right' },
];

export interface BusesDocumentInput {
  branchName: string | null;
  query: BranchBusesQuery;
  rows: BranchBusRow[];
  totals: BusTotals;
  now: Date;
}

export function toReportDocument({
  branchName,
  query,
  rows,
  totals,
  now,
}: BusesDocumentInput): ReportDocument {
  const filters = [
    ...(query.status === 'all' ? [] : [`Estado: ${BUS_STATUS_LABELS[query.status]}`]),
    ...(query.q ? [`Búsqueda: ${query.q}`] : []),
  ];
  const lines = rows.map((row) => ({
    cells: [
      formatPlate(row.plate),
      row.brand,
      row.model,
      String(row.capacity),
      BUS_STATUS_LABELS[row.status],
      row.driverName ?? 'Sin chofer',
      formatKm(row.mileageKm),
      String(row.completedTrips),
    ],
  }));
  const total = {
    cells: ['Total', '', '', '', '', '', '', String(totals.completedTrips)],
    tone: 'total' as const,
  };

  return {
    title: 'Listado general de buses',
    scope: branchName ? `Sucursal ${branchName}` : 'Sucursal',
    period: null,
    filters,
    highlights: [
      { label: 'Buses', value: String(totals.buses) },
      { label: 'Viajes realizados', value: String(totals.completedTrips) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows: lines.length > 0 ? [...lines, total] : [],
        emptyMessage: 'No hay buses con esos filtros.',
      },
    ],
    notes: [],
    generatedAt: now,
    landscape: true,
  };
}
