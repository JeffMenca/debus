'use client';

import type { BranchDepreciationRow } from '@debus/contracts';
import { columnHelperFor } from '@/components/data/data-table';
import { formatKm, formatPlate, formatQuetzales } from '@/lib/format';

const helper = columnHelperFor<BranchDepreciationRow>();

const numberHeader = (header: string) => <span className="block text-right">{header}</span>;

const numberCell = (value: number | string) => (
  <span className="block text-right font-mono tabular-nums">{value}</span>
);

export const depreciationReportColumns = helper.columns([
  helper.accessor('plate', {
    header: 'Placa',
    cell: (info) => <span className="font-mono font-bold">{formatPlate(info.getValue())}</span>,
  }),
  helper.display({
    id: 'bus',
    header: 'Bus',
    cell: ({ row }) => `${row.original.brand} ${row.original.model}`,
  }),
  helper.accessor('completedTrips', {
    header: () => numberHeader('Viajes'),
    cell: (info) => numberCell(info.getValue()),
  }),
  helper.accessor('kmTraveled', {
    header: () => numberHeader('Km recorridos'),
    cell: (info) => numberCell(formatKm(info.getValue())),
  }),
  helper.accessor('appliedPerKm', {
    header: () => numberHeader('Monto por km aplicado'),
    cell: (info) => {
      const perKm = info.getValue();
      return numberCell(perKm === null ? '—' : formatQuetzales(perKm));
    },
  }),
  helper.accessor('accumulated', {
    header: () => numberHeader('Depreciación acumulada'),
    cell: (info) => (
      <span className="block text-right font-mono font-bold tabular-nums">
        {formatQuetzales(info.getValue())}
      </span>
    ),
  }),
]);
