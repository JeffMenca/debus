'use client';

import type { SystemTopRouteRow, SystemTopRoutesPage } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { formatKm, formatPercent, formatQuetzales } from '@/lib/format';
import type { GroupedRow } from '@/lib/system-reports/grouped-rows';
import { amountCell, groupedRowProps, numberCell, numberHeader, renderCell } from './grouped-cells';

type Totals = SystemTopRoutesPage['summary']['totals'];
export type TopRouteTableRow = GroupedRow<SystemTopRouteRow, never, Totals>;

const helper = columnHelperFor<TopRouteTableRow>();

export const topRouteRowProps = groupedRowProps<SystemTopRouteRow, never, Totals>(
  () => '',
  'Total',
);

// What is known of the route itself, which may not have arrived yet.
function routeNote({ distanceKm, ticketPrice, active }: SystemTopRouteRow): string | null {
  if (active === false) return 'Ruta desactivada';
  if (distanceKm === null || ticketPrice === null) return null;
  return `${formatKm(distanceKm)} · ${formatQuetzales(ticketPrice)}`;
}

function RouteName({ route }: { route: SystemTopRouteRow }) {
  const note = routeNote(route);
  return (
    <span className="flex flex-col">
      <span className="font-semibold">{`${route.originLabel} → ${route.destinationLabel}`}</span>
      {note !== null && <span className="text-muted-foreground">{note}</span>}
    </span>
  );
}

export const topRouteColumns = helper.columns([
  helper.display({
    id: 'position',
    header: '#',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (route) => <span className="font-mono tabular-nums">{route.position}</span>,
      }),
  }),
  helper.display({
    id: 'route',
    header: 'Ruta',
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (route) => <RouteName route={route} />,
        total: () => <span>Total</span>,
      }),
  }),
  helper.display({
    id: 'trips',
    header: () => numberHeader('Viajes'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (route) => numberCell(route.trips),
        total: (totals) => numberCell(totals.trips),
      }),
  }),
  helper.display({
    id: 'online',
    header: () => numberHeader('En línea'),
    cell: ({ row }) =>
      renderCell(row.original, { row: (route) => numberCell(route.onlineTickets) }),
  }),
  helper.display({
    id: 'counter',
    header: () => numberHeader('Ventanilla'),
    cell: ({ row }) =>
      renderCell(row.original, { row: (route) => numberCell(route.counterTickets) }),
  }),
  helper.display({
    id: 'tickets',
    header: () => numberHeader('Boletos'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (route) => amountCell(String(route.tickets)),
        total: (totals) => amountCell(String(totals.tickets)),
      }),
  }),
  helper.display({
    id: 'income',
    header: () => numberHeader('Ingresos'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (route) => numberCell(formatQuetzales(route.income)),
        total: (totals) => amountCell(formatQuetzales(totals.income)),
      }),
  }),
  helper.display({
    id: 'share',
    header: () => numberHeader('Participación'),
    cell: ({ row }) =>
      renderCell(row.original, {
        row: (route) => (
          <span className="block text-right font-mono text-muted-foreground tabular-nums">
            {formatPercent(route.share)}
          </span>
        ),
      }),
  }),
]);
