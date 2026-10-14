'use client';

import type { BranchBusRow, BusDisplayStatus } from '@debus/contracts';
import { StatusDot } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { BUS_DOT_TONES } from '@/lib/fleet/bus-status';
import { formatKm, formatPlate } from '@/lib/format';

// The report calls a bus on the road "En ruta", the same word as its PDF.
export const BUS_REPORT_STATUS_LABELS: Record<BusDisplayStatus, string> = {
  IN_TRANSIT: 'En ruta',
  AVAILABLE: 'Disponible',
  IN_WORKSHOP: 'En taller',
  INACTIVE: 'Inactivo',
};

const helper = columnHelperFor<BranchBusRow>();

const numberCell = (value: number | string) => (
  <span className="block text-right font-mono tabular-nums">{value}</span>
);

export const busReportColumns = helper.columns([
  helper.accessor('plate', {
    header: 'Placa',
    cell: (info) => <span className="font-mono">{formatPlate(info.getValue())}</span>,
  }),
  helper.display({
    id: 'bus',
    header: 'Bus',
    cell: ({ row }) => (
      <span className="font-bold">{`${row.original.brand} ${row.original.model}`}</span>
    ),
  }),
  helper.accessor('capacity', {
    header: () => <span className="block text-right">Capacidad</span>,
    cell: (info) => numberCell(info.getValue()),
  }),
  helper.accessor('status', {
    header: 'Estado',
    cell: (info) => (
      <StatusDot
        tone={BUS_DOT_TONES[info.getValue()]}
        label={BUS_REPORT_STATUS_LABELS[info.getValue()]}
      />
    ),
  }),
  helper.accessor('driverName', {
    header: 'Chofer asignado',
    cell: (info) => info.getValue() ?? <span className="text-muted-foreground">Sin chofer</span>,
  }),
  helper.accessor('mileageKm', {
    header: () => <span className="block text-right">Kilometraje</span>,
    cell: (info) => numberCell(formatKm(info.getValue())),
  }),
  helper.accessor('completedTrips', {
    header: () => <span className="block text-right">Viajes realizados</span>,
    cell: (info) => numberCell(info.getValue()),
  }),
]);
