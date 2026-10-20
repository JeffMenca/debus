'use client';

import type { AvailableTrip } from '@debus/contracts';
import { ArrowRight, Ticket } from 'lucide-react';
import { columnHelperFor } from '@/components/data/data-table';
import { Moment } from '@/components/trips/trip-columns';
import { Button } from '@/components/ui/button';
import { formatPlate, formatQuetzales } from '@/lib/format';

const helper = columnHelperFor<AvailableTrip>();

// The trips a counter can sell; the last column opens the seats of the one chosen.
export const counterTripColumns = (onChoose: (tripId: string) => void) =>
  helper.columns([
    helper.accessor('departureAt', {
      header: 'Salida',
      cell: (info) => <Moment iso={info.getValue()} />,
    }),
    helper.accessor('destinationLabel', {
      header: 'Ruta',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-bold">
          {row.original.originLabel}
          <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-primary" />
          {row.original.destinationLabel}
        </span>
      ),
    }),
    helper.accessor('busPlate', {
      header: 'Bus',
      cell: (info) => <span className="font-mono">{formatPlate(info.getValue())}</span>,
    }),
    helper.accessor('ticketPrice', {
      header: () => <span className="block text-right">Precio</span>,
      cell: (info) => (
        <span className="block text-right font-mono tabular-nums">
          {formatQuetzales(info.getValue())}
        </span>
      ),
    }),
    helper.accessor('freeSeats', {
      header: () => <span className="block text-right">Libres</span>,
      cell: (info) => (
        <span className="block text-right font-mono tabular-nums">{info.getValue()}</span>
      ),
    }),
    helper.display({
      id: 'sell',
      header: () => <span className="sr-only">Vender</span>,
      cell: ({ row }) =>
        row.original.freeSeats === 0 ? (
          <span className="block text-right text-sm font-semibold text-muted-foreground">
            Agotado
          </span>
        ) : (
          <span className="flex justify-end">
            <Button
              variant="secondary"
              aria-label={`Vender ${row.original.originLabel} a ${row.original.destinationLabel}`}
              onClick={() => onChoose(row.original.tripId)}
            >
              <Ticket aria-hidden strokeWidth={1.75} className="size-4" />
              Vender
            </Button>
          </span>
        ),
    }),
  ]);
