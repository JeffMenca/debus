import type { SystemRoutesMap } from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatKm, formatMoney } from '../../common/report-format';
import { NO_BRANCH_NAME } from '../system-finance/branch-entries.sql';

const COLUMNS: PdfColumn[] = [
  { header: 'Destino', width: '*' },
  { header: 'Distancia', width: 'auto', align: 'right' },
  { header: 'Precio', width: 'auto', align: 'right' },
  { header: 'Boletos vendidos', width: 'auto', align: 'right' },
];

export interface RoutesMapDocumentInput {
  map: SystemRoutesMap;
  now: Date;
}

// The drawing stays on the screen: the PDF is the table of the routes of the chosen branch.
export function toReportDocument({ map, now }: RoutesMapDocumentInput): ReportDocument {
  const selected = map.branches.find((branch) => branch.id === map.selectedBranchId);
  const tickets = map.routes.reduce((sum, route) => sum + route.tickets, 0);
  return {
    title: 'Mapa de rutas',
    scope:
      map.selectedBranchId === null
        ? 'Todas las sucursales'
        : `Sucursal de origen: ${selected?.name ?? NO_BRANCH_NAME}`,
    period: null,
    filters: [],
    highlights: [
      { label: 'Rutas activas', value: String(map.routes.length) },
      { label: 'Boletos vendidos', value: String(tickets) },
    ],
    tables: [
      {
        columns: COLUMNS,
        rows:
          map.routes.length > 0
            ? [
                ...map.routes.map((route) => ({
                  cells: [
                    route.destinationName,
                    formatKm(route.distanceKm),
                    formatMoney(route.ticketPrice),
                    String(route.tickets),
                  ],
                })),
                { cells: ['Total', '', '', String(tickets)], tone: 'total' as const },
              ]
            : [],
        emptyMessage:
          map.selectedBranchId === null
            ? 'Todavía no hay rutas activas.'
            : 'Esta sucursal aún no tiene rutas activas.',
      },
    ],
    notes: [],
    generatedAt: now,
    landscape: false,
  };
}
