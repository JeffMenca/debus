'use client';

import type { Bus, BusDisplayStatus } from '@debus/contracts';
import { useMemo } from 'react';
import { Bus as BusIllustration } from '@/components/brand/bus';
import { StatusDot, type StatusTone } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { KPI_TONE_SURFACES } from '@/components/data/kpi-card';
import { RowActions } from '@/components/data/row-actions';
import { BUSES_PATH } from '@/hooks/use-buses';
import { photoPathOf } from '@/hooks/use-photo';
import { BUS_ART_TONES, BUS_STATUS_LABELS } from '@/lib/fleet/bus-status';
import { formatCount, formatPlate } from '@/lib/format';
import { FleetPhoto } from './fleet-photo';

const DOT_TONES: Record<BusDisplayStatus, StatusTone> = {
  IN_TRANSIT: 'mint',
  AVAILABLE: 'indigo',
  IN_WORKSHOP: 'mango',
  INACTIVE: 'muted',
};

interface BusColumnActions {
  onEdit: (bus: Bus) => void;
  onWorkshop: (bus: Bus, inWorkshop: boolean) => void;
  onToggle: (bus: Bus, active: boolean) => void;
}

const helper = columnHelperFor<Bus>();

export function useBusColumns({ onEdit, onWorkshop, onToggle }: BusColumnActions) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('model', {
          header: 'Bus',
          cell: ({ row }) => {
            const bus = row.original;
            const tone = BUS_STATUS_LABELS[bus.displayStatus].tone;
            return (
              <div className="flex items-center gap-3.5">
                <span
                  className={`relative flex h-[50px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] ${KPI_TONE_SURFACES[tone]}`}
                >
                  <FleetPhoto
                    path={bus.hasPhoto ? photoPathOf(BUSES_PATH, bus.id) : null}
                    alt={`Foto del bus ${formatPlate(bus.plate)}`}
                    fallback={
                      <BusIllustration
                        width={60}
                        tone={BUS_ART_TONES[bus.displayStatus]}
                        moving={bus.displayStatus === 'IN_TRANSIT'}
                      />
                    }
                  />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">{`${bus.brand} ${bus.model}`}</span>
                  <span className="text-[13px] text-muted-foreground">{bus.year}</span>
                </span>
              </div>
            );
          },
        }),
        helper.accessor('plate', {
          header: 'Placa',
          cell: (info) => <span className="font-mono">{formatPlate(info.getValue())}</span>,
        }),
        helper.accessor('capacity', {
          header: () => <span className="block text-right">Capacidad</span>,
          cell: (info) => <span className="block text-right font-mono">{info.getValue()}</span>,
        }),
        helper.accessor('assignedDriverName', {
          header: 'Chofer asignado',
          cell: (info) =>
            info.getValue() ?? <span className="text-muted-foreground">Sin asignar</span>,
        }),
        helper.accessor('mileageKm', {
          header: () => <span className="block text-right">Kilometraje</span>,
          cell: (info) => (
            <span className="block text-right font-mono tabular-nums">
              {formatCount(info.getValue())}
            </span>
          ),
        }),
        helper.accessor('completedTrips', {
          header: () => <span className="block text-right">Viajes</span>,
          cell: (info) => (
            <span className="block text-right font-mono tabular-nums">{info.getValue()}</span>
          ),
        }),
        helper.accessor('displayStatus', {
          header: 'Estado',
          cell: (info) => {
            const status = info.getValue();
            return (
              <StatusDot
                tone={DOT_TONES[status]}
                label={BUS_STATUS_LABELS[status].label}
                live={status === 'IN_TRANSIT'}
              />
            );
          },
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const bus = row.original;
            const inWorkshop = bus.operationalStatus === 'IN_WORKSHOP';
            return (
              <div className="flex justify-end">
                <RowActions
                  label={formatPlate(bus.plate)}
                  actions={[
                    { label: 'Editar', onSelect: () => onEdit(bus) },
                    {
                      label: 'Mandar a taller',
                      hidden: !bus.active || inWorkshop,
                      onSelect: () => onWorkshop(bus, true),
                    },
                    {
                      label: 'Volver a servicio',
                      hidden: !bus.active || !inWorkshop,
                      onSelect: () => onWorkshop(bus, false),
                    },
                    {
                      label: 'Desactivar',
                      tone: 'danger',
                      hidden: !bus.active,
                      onSelect: () => onToggle(bus, false),
                    },
                    {
                      label: 'Reactivar',
                      hidden: bus.active,
                      onSelect: () => onToggle(bus, true),
                    },
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [onEdit, onWorkshop, onToggle],
  );
}
