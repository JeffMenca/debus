import type { BranchDriverRow, BranchDriversQuery } from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatDay } from '../../common/report-format';
import type { DriverTotals } from './branch-drivers.rows';

const FILTER_LABELS: Record<Exclude<BranchDriversQuery['status'], 'all'>, string> = {
  active: 'Activos',
  inactive: 'Inactivos',
};

const COLUMNS: PdfColumn[] = [
  { header: 'Licencia', width: 'auto' },
  { header: 'Nombre completo', width: '*' },
  { header: 'Tipo', width: 'auto' },
  { header: 'Vence', width: 'auto' },
  { header: 'Estado', width: 'auto' },
  { header: 'Viajes realizados', width: 'auto', align: 'right' },
];

export interface DriversDocumentInput {
  branchName: string | null;
  query: BranchDriversQuery;
  rows: BranchDriverRow[];
  totals: DriverTotals;
  now: Date;
}

export function toReportDocument({
  branchName,
  query,
  rows,
  totals,
  now,
}: DriversDocumentInput): ReportDocument {
  const filters = [
    ...(query.status === 'all' ? [] : [`Estado: ${FILTER_LABELS[query.status]}`]),
    ...(query.q ? [`Búsqueda: ${query.q}`] : []),
  ];
  const lines = rows.map((row) => ({
    cells: [
      row.licenseNumber,
      row.fullName,
      row.licenseType,
      formatDay(row.licenseExpiresOn),
      row.active ? 'Activo' : 'Inactivo',
      String(row.completedTrips),
    ],
  }));
  const total = {
    cells: ['Total', '', '', '', '', String(totals.completedTrips)],
    tone: 'total' as const,
  };

  return {
    title: 'Listado general de choferes',
    scope: branchName ? `Sucursal ${branchName}` : 'Sucursal',
    period: null,
    filters,
    highlights: [
      { label: 'Choferes', value: String(totals.drivers) },
      { label: 'Viajes realizados', value: String(totals.completedTrips) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows: lines.length > 0 ? [...lines, total] : [],
        emptyMessage: 'No hay choferes con esos filtros.',
      },
    ],
    notes: [],
    generatedAt: now,
    landscape: false,
  };
}
