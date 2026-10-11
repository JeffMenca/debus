'use client';

import type { Branch } from '@debus/contracts';
import { Building2 } from 'lucide-react';
import { useMemo } from 'react';
import { StatusDot, type StatusTone } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { RowActions } from '@/components/data/row-actions';
import { formatPhone } from '@/lib/format';

export const BRANCH_STATUS_VIEW: Record<
  'active' | 'inactive',
  { tone: StatusTone; label: string }
> = {
  active: { tone: 'mint', label: 'Activa' },
  inactive: { tone: 'muted', label: 'Inactiva' },
};

interface BranchColumnActions {
  onEdit: (branch: Branch) => void;
  onToggle: (branch: Branch, active: boolean) => void;
}

const helper = columnHelperFor<Branch>();

// Columns must be stable between renders, so they are rebuilt only when their inputs change.
export function useBranchColumns({ onEdit, onToggle }: BranchColumnActions) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('name', {
          header: 'Sucursal',
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-mint-100 text-mint-700"
              >
                <Building2 strokeWidth={1.75} className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-bold">{row.original.name}</span>
                <span className="font-mono text-[13px] text-muted-foreground">
                  {row.original.code}
                </span>
              </span>
            </div>
          ),
        }),
        helper.display({
          id: 'location',
          header: 'Ubicación',
          cell: ({ row }) => `${row.original.municipality}, ${row.original.department}`,
        }),
        helper.accessor('phone', {
          header: 'Teléfono',
          cell: (info) => (
            <span className="font-mono tabular-nums">{formatPhone(info.getValue())}</span>
          ),
        }),
        helper.display({
          id: 'admins',
          header: 'Administradores',
          cell: ({ row }) =>
            row.original.admins.length === 0 ? (
              <span className="text-rose-700">Sin administrador</span>
            ) : (
              row.original.admins
                .map(
                  (admin) =>
                    `${admin.fullName}${admin.status === 'PENDING' ? ' (invitación enviada)' : ''}`,
                )
                .join(', ')
            ),
        }),
        helper.accessor('active', {
          header: 'Estado',
          cell: (info) => {
            const view = BRANCH_STATUS_VIEW[info.getValue() ? 'active' : 'inactive'];
            return <StatusDot tone={view.tone} label={view.label} />;
          },
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const branch = row.original;
            return (
              <div className="flex justify-end">
                <RowActions
                  label={branch.name}
                  actions={[
                    { label: 'Editar', onSelect: () => onEdit(branch) },
                    {
                      label: 'Desactivar',
                      tone: 'danger',
                      hidden: !branch.active,
                      onSelect: () => onToggle(branch, false),
                    },
                    {
                      label: 'Reactivar',
                      hidden: branch.active,
                      onSelect: () => onToggle(branch, true),
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
