'use client';

import type { Route } from '@debus/contracts';
import { Info } from 'lucide-react';
import { useMemo } from 'react';
import { StatusDot } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { RowActions } from '@/components/data/row-actions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatKm, formatQuetzales } from '@/lib/format';

const HAS_TRIPS_HINT = 'Tiene viajes: puedes retirarla';

interface RouteColumnActions {
  onEdit: (route: Route) => void;
  onToggle: (route: Route, active: boolean) => void;
  onDelete: (route: Route) => void;
}

const helper = columnHelperFor<Route>();

export function useRouteColumns({ onEdit, onToggle, onDelete }: RouteColumnActions) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('destinationName', {
          header: 'Ruta',
          cell: ({ row }) => {
            const route = row.original;
            return (
              <div className="flex items-center gap-2.5 font-bold">
                <span>{route.originName}</span>
                <svg
                  aria-hidden
                  viewBox="0 0 44 8"
                  width="44"
                  height="8"
                  className="shrink-0 text-primary"
                >
                  <line
                    x1="2"
                    y1="4"
                    x2="42"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="4 5"
                    className="animate-route-sm motion-reduce:animate-none"
                  />
                </svg>
                <span>{route.destinationName}</span>
                {route.hasTrips && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={HAS_TRIPS_HINT}
                          className="rounded-full text-muted-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <Info aria-hidden strokeWidth={1.75} className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{HAS_TRIPS_HINT}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            );
          },
        }),
        helper.accessor('distanceKm', {
          header: () => <span className="block text-right">Distancia</span>,
          cell: (info) => (
            <span className="block text-right font-mono tabular-nums">
              {formatKm(info.getValue())}
            </span>
          ),
        }),
        helper.accessor('ticketPrice', {
          header: () => <span className="block text-right">Precio del boleto</span>,
          cell: (info) => (
            <span className="block text-right font-mono tabular-nums">
              {formatQuetzales(info.getValue())}
            </span>
          ),
        }),
        helper.accessor('active', {
          header: 'Estado',
          cell: (info) => (
            <StatusDot
              tone={info.getValue() ? 'mint' : 'muted'}
              label={info.getValue() ? 'Activa' : 'Retirada'}
            />
          ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const route = row.original;
            return (
              <div className="flex justify-end">
                <RowActions
                  label={`${route.originName} a ${route.destinationName}`}
                  actions={[
                    { label: 'Editar', onSelect: () => onEdit(route) },
                    {
                      label: 'Retirar',
                      hidden: !route.active,
                      onSelect: () => onToggle(route, false),
                    },
                    {
                      label: 'Reactivar',
                      hidden: route.active,
                      onSelect: () => onToggle(route, true),
                    },
                    {
                      label: 'Eliminar',
                      tone: 'danger',
                      hidden: route.hasTrips,
                      onSelect: () => onDelete(route),
                    },
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [onEdit, onToggle, onDelete],
  );
}
