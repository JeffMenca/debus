'use client';

import type { UserListItem, UserStatus } from '@debus/contracts';
import { useMemo } from 'react';
import { StatusDot, type StatusTone } from '@/components/brand/status-dot';
import { RowActions } from '@/components/data/row-actions';
import { columnHelperFor } from '@/components/data/data-table';
import { initialsOf } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/roles';

export const USER_STATUS_VIEW: Record<UserStatus, { tone: StatusTone; label: string }> = {
  ACTIVE: { tone: 'mint', label: 'Activo' },
  PENDING: { tone: 'mango', label: 'Invitación enviada' },
  INACTIVE: { tone: 'muted', label: 'Inactivo' },
};

interface UserColumnActions {
  onEdit: (user: UserListItem) => void;
  onResend: (user: UserListItem) => void;
  onToggle: (user: UserListItem, active: boolean) => void;
}

const helper = columnHelperFor<UserListItem>();

// Columns must be stable between renders, so they are rebuilt only when their inputs change.
export function useUserColumns({ onEdit, onResend, onToggle }: UserColumnActions) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('fullName', {
          header: 'Persona',
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700"
              >
                {initialsOf(row.original.fullName)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-bold">{row.original.fullName}</span>
                <span className="text-[13px] text-muted-foreground">{row.original.email}</span>
              </span>
            </div>
          ),
        }),
        helper.accessor('role', { header: 'Rol', cell: (info) => ROLE_LABELS[info.getValue()] }),
        helper.accessor('branchName', {
          header: 'Sucursal',
          cell: (info) => info.getValue() ?? <span className="text-muted-foreground">—</span>,
        }),
        helper.accessor('status', {
          header: 'Estado',
          cell: (info) => {
            const view = USER_STATUS_VIEW[info.getValue()];
            return <StatusDot tone={view.tone} label={view.label} />;
          },
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const user = row.original;
            // A driver's account follows the fleet record, so there is nothing to change here.
            if (user.role === 'DRIVER') return null;
            return (
              <div className="flex justify-end">
                <RowActions
                  label={user.fullName}
                  actions={[
                    { label: 'Editar', onSelect: () => onEdit(user) },
                    {
                      label: 'Reenviar invitación',
                      hidden: user.status !== 'PENDING',
                      onSelect: () => onResend(user),
                    },
                    {
                      label: 'Desactivar',
                      tone: 'danger',
                      hidden: user.status === 'INACTIVE',
                      onSelect: () => onToggle(user, false),
                    },
                    {
                      label: 'Reactivar',
                      hidden: user.status !== 'INACTIVE',
                      onSelect: () => onToggle(user, true),
                    },
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [onEdit, onResend, onToggle],
  );
}
