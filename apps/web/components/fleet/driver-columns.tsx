'use client';

import type { Driver } from '@debus/contracts';
import { useMemo } from 'react';
import { StatusDot } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { RowActions } from '@/components/data/row-actions';
import { DRIVERS_PATH } from '@/hooks/use-drivers';
import { photoPathOf } from '@/hooks/use-photo';
import { formatPhone, formatPlate, initialsOf } from '@/lib/format';
import { FleetPhoto } from './fleet-photo';
import { LicenseBadge } from './license-badge';

interface DriverColumnActions {
  onEdit: (driver: Driver) => void;
  onToggle: (driver: Driver, active: boolean) => void;
}

const helper = columnHelperFor<Driver>();

export function useDriverColumns({ onEdit, onToggle }: DriverColumnActions) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('fullName', {
          header: 'Chofer',
          cell: ({ row }) => {
            const driver = row.original;
            return (
              <div className="flex items-center gap-3">
                <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                  <FleetPhoto
                    path={driver.hasPhoto ? photoPathOf(DRIVERS_PATH, driver.id) : null}
                    alt={`Foto de ${driver.fullName}`}
                    fallback={<span aria-hidden>{initialsOf(driver.fullName)}</span>}
                  />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">{driver.fullName}</span>
                  <span className="text-[13px] text-muted-foreground">{driver.email}</span>
                </span>
              </div>
            );
          },
        }),
        helper.accessor('licenseNumber', {
          header: 'Licencia',
          cell: ({ row }) => (
            <span className="flex flex-col">
              <span className="font-mono">{row.original.licenseNumber}</span>
              <span className="text-[13px] text-muted-foreground">{`Tipo ${row.original.licenseType}`}</span>
            </span>
          ),
        }),
        helper.accessor('licenseExpiresOn', {
          header: 'Vencimiento',
          cell: (info) => <LicenseBadge expiresOn={info.getValue()} />,
        }),
        helper.accessor('phone', {
          header: 'Teléfono',
          cell: (info) => (
            <span className="font-mono tabular-nums">{formatPhone(info.getValue())}</span>
          ),
        }),
        helper.accessor('assignedBusPlate', {
          header: 'Bus de planta',
          cell: (info) => {
            const plate = info.getValue();
            return plate ? (
              <span className="font-mono">{formatPlate(plate)}</span>
            ) : (
              <span className="text-muted-foreground">Sin bus</span>
            );
          },
        }),
        helper.accessor('completedTrips', {
          header: () => <span className="block text-right">Viajes</span>,
          cell: (info) => (
            <span className="block text-right font-mono tabular-nums">{info.getValue()}</span>
          ),
        }),
        helper.accessor('active', {
          header: 'Estado',
          cell: (info) => (
            <StatusDot
              tone={info.getValue() ? 'mint' : 'muted'}
              label={info.getValue() ? 'Activo' : 'Inactivo'}
            />
          ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const driver = row.original;
            return (
              <div className="flex justify-end">
                <RowActions
                  label={driver.fullName}
                  actions={[
                    { label: 'Editar', onSelect: () => onEdit(driver) },
                    {
                      label: 'Desactivar',
                      tone: 'danger',
                      hidden: !driver.active,
                      onSelect: () => onToggle(driver, false),
                    },
                    {
                      label: 'Reactivar',
                      hidden: driver.active,
                      onSelect: () => onToggle(driver, true),
                    },
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [onEdit, onToggle],
  );
}
