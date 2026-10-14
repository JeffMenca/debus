'use client';

import type { Trip, TripStatus } from '@debus/contracts';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
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
export function Moment({ iso }: { iso: string }) {
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

const departureColumn = helper.accessor('departureAt', {
  header: 'Salida',
  cell: (info) => <Moment iso={info.getValue()} />,
});

// The route is the way into the trip: its screen has the departure, the arrival and the rest.
const routeColumn = (hrefOf: (trip: Trip) => string) =>
  helper.accessor('destinationName', {
    header: 'Ruta',
    cell: ({ row }) => (
      <span className="flex flex-col">
        <Link
          href={hrefOf(row.original)}
          className="flex items-center gap-2 font-bold hover:text-primary"
        >
          {row.original.originName}
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-primary" />
          {row.original.destinationName}
        </Link>
        {row.original.type === 'RENTAL' && (
          <span className="text-[13px] font-semibold text-coral-700">Alquiler</span>
        )}
      </span>
    ),
  });

const arrivalColumn = helper.accessor('estimatedArrivalAt', {
  header: 'Llegada estimada',
  cell: (info) => <Moment iso={info.getValue()} />,
});

const statusColumn = helper.accessor('status', {
  header: 'Estado',
  cell: (info) => {
    const { label, tone } = TRIP_STATUS[info.getValue()];
    return <StatusDot tone={tone} label={label} live={info.getValue() === 'IN_TRANSIT'} />;
  },
});

export const tripColumns = helper.columns([
  departureColumn,
  routeColumn((trip) => `/sucursal/viajes/${trip.id}`),
  helper.accessor('busPlate', {
    header: 'Bus y chofer',
    cell: ({ row }) => <BusAndDriver trip={row.original} />,
  }),
  arrivalColumn,
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
  statusColumn,
]);

// A driver's own trips: no price or capacity, and each one opens on the driver's screen.
export const driverTripColumns = helper.columns([
  departureColumn,
  routeColumn((trip) => `/chofer/viajes/${trip.id}`),
  helper.accessor('busPlate', {
    header: 'Bus',
    cell: (info) => <span className="font-mono">{formatPlate(info.getValue())}</span>,
  }),
  arrivalColumn,
  statusColumn,
]);
