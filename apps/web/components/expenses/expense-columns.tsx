'use client';

import type { RepairExpense } from '@debus/contracts';
import { useMemo } from 'react';
import { columnHelperFor } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { formatPlate, formatQuetzales, formatShortDate } from '@/lib/format';

const helper = columnHelperFor<RepairExpense>();

const money = (value: number) => (
  <span className="block text-right font-mono tabular-nums">{formatQuetzales(value)}</span>
);

// The categories of the lines, each once, in the order they appear.
export const categoriesOf = (expense: RepairExpense): string =>
  [...new Set(expense.lines.map((line) => line.categoryName))].join(', ');

// Columns must be stable between renders, so they are rebuilt only when their inputs change.
export function useExpenseColumns(onOpen: (expense: RepairExpense) => void) {
  return useMemo(
    () =>
      helper.columns([
        helper.accessor('serviceDate', {
          header: 'Fecha',
          cell: (info) => (
            <span className="font-mono tabular-nums">{formatShortDate(info.getValue(), true)}</span>
          ),
        }),
        helper.accessor('busPlate', {
          header: 'Bus',
          cell: (info) => <span className="font-mono">{formatPlate(info.getValue())}</span>,
        }),
        helper.display({
          id: 'categories',
          header: 'Categorías',
          cell: ({ row }) => categoriesOf(row.original),
        }),
        helper.accessor('laborTotal', {
          header: () => <span className="block text-right">Mano de obra</span>,
          cell: (info) => money(info.getValue()),
        }),
        helper.accessor('partsTotal', {
          header: () => <span className="block text-right">Repuestos</span>,
          cell: (info) => money(info.getValue()),
        }),
        helper.accessor('total', {
          header: () => <span className="block text-right">Total</span>,
          cell: (info) => <span className="font-bold">{money(info.getValue())}</span>,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                aria-label={`Ver detalle del gasto de ${formatPlate(row.original.busPlate)}`}
                onClick={() => onOpen(row.original)}
              >
                Ver detalle
              </Button>
            </div>
          ),
        }),
      ]),
    [onOpen],
  );
}
