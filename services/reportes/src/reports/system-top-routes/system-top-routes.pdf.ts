import type { SystemTopRouteRow, SystemTopRoutesQuery } from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatKm, formatMoney, formatPercent, reportPeriod } from '../../common/report-format';
import { branchFilter } from '../system-finance/branch-sections.pdf';
import type { TopRoutesTotals } from './system-top-routes.rows';

const number = (header: string): PdfColumn => ({ header, width: 'auto', align: 'right' });
const COLUMNS: PdfColumn[] = [
  { header: '#', width: 'auto' },
  { header: 'Ruta', width: '*' },
  number('Distancia'),
  number('Precio'),
  number('Viajes'),
  number('En línea'),
  number('Ventanilla'),
  number('Boletos'),
  number('Ingresos'),
  number('Participación'),
];

const NOTE =
  'Solo aparecen las rutas con al menos un boleto pagado en el periodo. No incluye boletos de viajes eliminados.';
// A route that has not reached the report yet does not tell its distance or its price.
const UNKNOWN = '—';

export interface TopRoutesDocumentInput {
  query: SystemTopRoutesQuery;
  // The name of the origin branch that was chosen, or null when it has no copy yet.
  branchLabel: string | null;
  rows: SystemTopRouteRow[];
  totals: TopRoutesTotals;
  now: Date;
}

export function toReportDocument({
  query,
  branchLabel,
  rows,
  totals,
  now,
}: TopRoutesDocumentInput): ReportDocument {
  return {
    title: 'Rutas más demandadas',
    scope: 'Todas las sucursales',
    period: reportPeriod(query.from, query.to),
    filters: branchFilter(query.branchId, branchLabel, 'Sucursal de origen'),
    highlights: [
      { label: 'Rutas', value: String(totals.routes) },
      { label: 'Viajes', value: String(totals.trips) },
      { label: 'Boletos', value: String(totals.tickets) },
      { label: 'Ingresos', value: formatMoney(totals.income) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows:
          rows.length > 0
            ? [
                ...rows.map((row) => ({
                  cells: [
                    String(row.position),
                    `${row.originLabel} – ${row.destinationLabel}`,
                    row.distanceKm === null ? UNKNOWN : formatKm(row.distanceKm),
                    row.ticketPrice === null ? UNKNOWN : formatMoney(row.ticketPrice),
                    String(row.trips),
                    String(row.onlineTickets),
                    String(row.counterTickets),
                    String(row.tickets),
                    formatMoney(row.income),
                    formatPercent(row.share),
                  ],
                })),
                {
                  cells: [
                    '',
                    'Total',
                    '',
                    '',
                    String(totals.trips),
                    '',
                    '',
                    String(totals.tickets),
                    formatMoney(totals.income),
                    formatPercent(100),
                  ],
                  tone: 'total' as const,
                },
              ]
            : [],
        emptyMessage: 'No hay rutas con boletos vendidos con esos filtros.',
      },
    ],
    notes: [NOTE],
    generatedAt: now,
    landscape: true,
  };
}
