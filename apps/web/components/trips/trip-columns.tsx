'use client';

import type { Trip, TripStatus } from '@debus/contracts';
import { ArrowRight } from 'lucide-react';
import { StatusDot, type StatusTone } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { formatPlate, formatQuetzales, formatShortDate } from '@/lib/format';
import { splitGuatemala } from '@/lib/trips/schedule';

export const TRIP_STATUS: Record<TripStatus, { label: string; tone: StatusTone }> = {
  SCHEDULED: { label: 'Programado', tone: 'indigo' },
  IN_TRANSIT: { label: 'En camino', tone: 'mint' },
  COMPLETED: { label: 'Completado', tone: 'muted' },
};

// The hour of Guatemala, with its day underneath.
function Moment({ iso }: { iso: string }) {
  const { day, time } = splitGuatemala(iso);
  return (
    <span className="flex flex-col">
      <span className="font-mono font-semibold tabular-nums">{time}</span>
      <span className="text-[13px] text-muted-foreground">{formatShortDate(day)}</span>
    </span>
  );
}

// The plate of the bus with its driver beside it, as both the trips list and the branch panel show it.
export function BusAndDriver({ trip }: { trip: Pick<Trip, 'busPlate' | 'driverName'> }) {
  return (
    <span>
      <span className="font-mono">{formatPlate(trip.busPlate)}</span>
      <span className="text-muted-foreground"> · {trip.driverName}</span>
    </span>
  );
}

const helper = columnHelperFor<Trip>();

export const tripColumns = helper.columns([
  helper.accessor('departureAt', {
    header: 'Salida',
    cell: (info) => <Moment iso={info.getValue()} />,
  }),
  helper.accessor('destinationName', {
    header: 'Ruta',
    cell: ({ row }) => (
      <span className="flex items-center gap-2 font-bold">
        {row.original.originName}
        <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-primary" />
        {row.original.destinationName}
      </span>
    ),
  }),
  helper.accessor('busPlate', {
    header: 'Bus y chofer',
    cell: ({ row }) => <BusAndDriver trip={row.original} />,
  }),
  helper.accessor('estimatedArrivalAt', {
    header: 'Llegada estimada',
    cell: (info) => <Moment iso={info.getValue()} />,
  }),
  helper.accessor('ticketPrice', {
    header: () => <span className="block text-right">Precio</span>,
    cell: (info) => {
      const price = info.getValue();
      return (
        <span className="block text-right font-mono tabular-nums">
          {price === null ? '—' : formatQuetzales(price)}
        </span>
      );
    },
  }),
  helper.accessor('capacity', {
    header: () => <span className="block text-right">Capacidad</span>,
    cell: (info) => <span className="block text-right font-mono">{info.getValue()}</span>,
  }),
  helper.accessor('status', {
    header: 'Estado',
    cell: (info) => {
      const { label, tone } = TRIP_STATUS[info.getValue()];
      return <StatusDot tone={tone} label={label} live={info.getValue() === 'IN_TRANSIT'} />;
    },
  }),
]);
