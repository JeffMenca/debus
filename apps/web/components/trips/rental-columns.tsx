'use client';

import type { RentalRequest } from '@debus/contracts';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { columnHelperFor } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { formatQuetzales } from '@/lib/format';
import { Moment } from './trip-columns';

const helper = columnHelperFor<RentalRequest>();

// Columns must be stable between renders, so they are rebuilt only when their inputs change.
export function useRentalColumns(onAssign: (rental: RentalRequest) => void) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('clientName', {
          header: 'Cliente',
          cell: ({ row }) => (
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">{row.original.clientName}</span>
              <span className="font-mono text-[13px] text-muted-foreground">
                {row.original.nit}
              </span>
            </span>
          ),
        }),
        helper.accessor('destinationLabel', {
          header: 'Ruta',
          cell: ({ row }) => (
            <span className="flex items-center gap-2">
              {row.original.originLabel}
              <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-primary" />
              {row.original.destinationLabel}
            </span>
          ),
        }),
        helper.accessor('departureAt', {
          header: 'Salida',
          cell: (info) => <Moment iso={info.getValue()} />,
        }),
        helper.accessor('passengers', {
          header: () => <span className="block text-right">Pasajeros</span>,
          cell: (info) => <span className="block text-right font-mono">{info.getValue()}</span>,
        }),
        helper.accessor('price', {
          header: () => <span className="block text-right">Precio</span>,
          cell: (info) => (
            <span className="block text-right font-mono tabular-nums">
              {formatQuetzales(info.getValue())}
            </span>
          ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                aria-label={`Asignar bus y chofer a ${row.original.clientName}`}
                onClick={() => onAssign(row.original)}
              >
                Asignar
              </Button>
            </div>
          ),
        }),
      ]),
    [onAssign],
  );
}
