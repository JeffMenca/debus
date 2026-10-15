'use client';

import type { BranchRentalIncomeRow } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { formatDateTime, formatPlate, formatQuetzales, formatShortDate } from '@/lib/format';

const helper = columnHelperFor<BranchRentalIncomeRow>();

const numberHeader = (header: string) => <span className="block text-right">{header}</span>;

const nowrap = (text: string) => <span className="whitespace-nowrap">{text}</span>;

export const rentalIncomeReportColumns = helper.columns([
  helper.accessor('clientName', {
    header: 'Cliente',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-semibold">{row.original.clientName}</span>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          NIT {row.original.nit}
        </span>
      </div>
    ),
  }),
  helper.accessor('originLabel', { header: 'Origen' }),
  helper.accessor('destinationLabel', { header: 'Destino' }),
  helper.accessor('departureAt', {
    header: 'Salida',
    cell: (info) => nowrap(formatDateTime(info.getValue())),
  }),
  helper.accessor('returnAt', {
    header: 'Regreso',
    cell: (info) => {
      const returnAt = info.getValue();
      return returnAt === null ? (
        <span className="text-muted-foreground">Solo ida</span>
      ) : (
        nowrap(formatDateTime(returnAt))
      );
    },
  }),
  helper.accessor('paidOn', {
    header: 'Pagado el',
    cell: (info) => nowrap(formatShortDate(info.getValue(), true)),
  }),
  helper.accessor('busPlate', {
    header: 'Bus',
    cell: (info) => {
      const plate = info.getValue();
      return plate === null ? (
        <span className="text-muted-foreground">Por asignar</span>
      ) : (
        <span className="font-mono font-bold whitespace-nowrap">{formatPlate(plate)}</span>
      );
    },
  }),
  helper.accessor('passengers', {
    header: () => numberHeader('Pasajeros'),
    cell: (info) => (
      <span className="block text-right font-mono tabular-nums">{info.getValue()}</span>
    ),
  }),
  helper.accessor('price', {
    header: () => numberHeader('Precio'),
    cell: (info) => (
      <span className="block text-right font-mono font-bold tabular-nums">
        {formatQuetzales(info.getValue())}
      </span>
    ),
  }),
]);
