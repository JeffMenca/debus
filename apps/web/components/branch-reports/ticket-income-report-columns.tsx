'use client';

import type { BranchTicketIncomeRow } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { formatDateTime, formatPlate, formatQuetzales } from '@/lib/format';

const helper = columnHelperFor<BranchTicketIncomeRow>();

const numberHeader = (header: string) => <span className="block text-right">{header}</span>;

const numberCell = (value: number | string) => (
  <span className="block text-right font-mono tabular-nums">{value}</span>
);

export const ticketIncomeReportColumns = helper.columns([
  helper.accessor('departureAt', {
    header: 'Salida',
    cell: (info) => <span className="whitespace-nowrap">{formatDateTime(info.getValue())}</span>,
  }),
  helper.display({
    id: 'route',
    header: 'Ruta',
    cell: ({ row }) => `${row.original.originLabel} → ${row.original.destinationLabel}`,
  }),
  helper.accessor('busPlate', {
    header: 'Bus',
    cell: (info) => {
      const plate = info.getValue();
      return plate === null ? (
        <span className="text-muted-foreground">Bus sin datos</span>
      ) : (
        <span className="font-mono font-bold whitespace-nowrap">{formatPlate(plate)}</span>
      );
    },
  }),
  helper.accessor('tickets', {
    header: () => numberHeader('Boletos'),
    cell: (info) => numberCell(info.getValue()),
  }),
  helper.accessor('onlineTickets', {
    header: () => numberHeader('En línea'),
    cell: (info) => numberCell(info.getValue()),
  }),
  helper.accessor('counterTickets', {
    header: () => numberHeader('Ventanilla'),
    cell: (info) => numberCell(info.getValue()),
  }),
  helper.accessor('income', {
    header: () => numberHeader('Ingreso'),
    cell: (info) => (
      <span className="block text-right font-mono font-bold tabular-nums">
        {formatQuetzales(info.getValue())}
      </span>
    ),
  }),
]);
