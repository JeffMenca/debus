'use client';

import type { ExpenseCategory } from '@debus/contracts';
import { Tag } from 'lucide-react';
import { useMemo } from 'react';
import { StatusDot } from '@/components/brand/status-dot';
import { columnHelperFor } from '@/components/data/data-table';
import { RowActions } from '@/components/data/row-actions';

interface CategoryColumnActions {
  onRename: (category: ExpenseCategory) => void;
  onToggle: (category: ExpenseCategory, active: boolean) => void;
  onDelete: (category: ExpenseCategory) => void;
}

const helper = columnHelperFor<ExpenseCategory>();

// Columns must be stable between renders, so they are rebuilt only when their inputs change.
export function useCategoryColumns({ onRename, onToggle, onDelete }: CategoryColumnActions) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('name', {
          header: 'Categoría',
          cell: (info) => (
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-coral-100 text-coral-700"
              >
                <Tag strokeWidth={1.75} className="size-5" />
              </span>
              <span className="font-bold">{info.getValue()}</span>
            </div>
          ),
        }),
        helper.accessor('inUse', {
          header: 'Uso',
          cell: (info) => (info.getValue() ? 'Con gastos' : 'Sin gastos'),
        }),
        helper.accessor('active', {
          header: 'Estado',
          cell: (info) => (
            <StatusDot
              tone={info.getValue() ? 'mint' : 'muted'}
              label={info.getValue() ? 'Activa' : 'Inactiva'}
            />
          ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const category = row.original;
            return (
              <div className="flex justify-end">
                <RowActions
                  label={category.name}
                  actions={[
                    { label: 'Renombrar', onSelect: () => onRename(category) },
                    {
                      label: 'Desactivar',
                      tone: 'danger',
                      hidden: !category.active,
                      onSelect: () => onToggle(category, false),
                    },
                    {
                      label: 'Reactivar',
                      hidden: category.active,
                      onSelect: () => onToggle(category, true),
                    },
                    {
                      label: 'Eliminar',
                      tone: 'danger',
                      // A category with expenses stays: it can only be deactivated.
                      hidden: category.inUse,
                      onSelect: () => onDelete(category),
                    },
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [onRename, onToggle, onDelete],
  );
}
