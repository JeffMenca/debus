import {
  type BranchTicketIncomeQuery,
  type BranchTicketIncomeRow,
  formatPlate,
} from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatInstant, formatMoney, reportPeriod } from '../../common/report-format';
import {
  type TicketIncomeGroup,
  type TicketIncomeTotals,
  routeName,
} from './branch-ticket-income.rows';

const TRIP_COLUMNS: PdfColumn[] = [
  { header: 'Salida', width: 'auto' },
  { header: 'Ruta', width: '*' },
  { header: 'Bus', width: 'auto' },
  { header: 'Boletos', width: 'auto', align: 'right' },
  { header: 'En línea', width: 'auto', align: 'right' },
  { header: 'Ventanilla', width: 'auto', align: 'right' },
  { header: 'Ingreso', width: 'auto', align: 'right' },
];
const ROUTE_COLUMNS: PdfColumn[] = [
  { header: 'Ruta', width: '*' },
  { header: 'Boletos', width: 'auto', align: 'right' },
  { header: 'Ingreso', width: 'auto', align: 'right' },
];

const NOTE = 'No incluye boletos de viajes eliminados: se reembolsan.';
const NO_BUS = 'Bus sin datos';
const NO_ROUTE = 'Ruta sin datos';

export interface TicketIncomeDocumentInput {
  branchName: string | null;
  query: BranchTicketIncomeQuery;
  rows: BranchTicketIncomeRow[];
  totals: TicketIncomeTotals;
  groups: TicketIncomeGroup[];
  routeLabel: string | null;
  busLabel: string | null;
  now: Date;
}

export function toReportDocument({
  branchName,
  query,
  rows,
  totals,
  groups,
  routeLabel,
  busLabel,
  now,
}: TicketIncomeDocumentInput): ReportDocument {
  const tripRows = rows.map((row) => ({
    cells: [
      formatInstant(row.departureAt),
      routeName(row.originLabel, row.destinationLabel),
      row.busPlate ? formatPlate(row.busPlate) : NO_BUS,
      String(row.tickets),
      String(row.onlineTickets),
      String(row.counterTickets),
      formatMoney(row.income),
    ],
  }));
  const tripTotal = {
    cells: ['Total', '', '', String(totals.tickets), '', '', formatMoney(totals.income)],
    tone: 'total' as const,
  };
  const routeRows = groups.map((group) => ({
    cells: [
      routeName(group.originLabel, group.destinationLabel),
      String(group.tickets),
      formatMoney(group.income),
    ],
  }));
  const routeTotal = {
    cells: ['Total general', String(totals.tickets), formatMoney(totals.income)],
    tone: 'total' as const,
  };

  return {
    title: 'Ingresos por venta de boletos',
    scope: branchName ? `Sucursal ${branchName}` : 'Sucursal',
    period: reportPeriod(query.from, query.to),
    filters: [
      ...(query.routeId ? [`Ruta: ${routeLabel ?? NO_ROUTE}`] : []),
      ...(query.busId ? [`Bus: ${busLabel ?? NO_BUS}`] : []),
    ],
    highlights: [
      { label: 'Viajes', value: String(totals.trips) },
      { label: 'Boletos', value: String(totals.tickets) },
      { label: 'Ingresos', value: formatMoney(totals.income) },
    ],
    tables: [
      {
        columns: TRIP_COLUMNS,
        rows: tripRows.length > 0 ? [...tripRows, tripTotal] : [],
        emptyMessage: 'No hay ingresos por boletos con esos filtros.',
      },
      ...(routeRows.length > 0
        ? [
            {
              title: 'Resumen por ruta',
              columns: ROUTE_COLUMNS,
              rows: [...routeRows, routeTotal],
              emptyMessage: '',
            },
          ]
        : []),
    ],
    notes: [NOTE],
    generatedAt: now,
    landscape: true,
  };
}
