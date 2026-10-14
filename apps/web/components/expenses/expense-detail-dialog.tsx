'use client';

import type { RepairExpense } from '@debus/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LINE_KIND_LABELS } from '@/lib/expenses/expense-form';
import { formatPlate, formatQuetzales, formatShortDate } from '@/lib/format';

interface ExpenseDetailDialogProps {
  // The expense whose lines are shown; null keeps the dialog closed.
  expense: RepairExpense | null;
  onOpenChange: (open: boolean) => void;
}

// The lines of one expense: what was paid, in which category and for how much.
export function ExpenseDetailDialog({ expense, onOpenChange }: ExpenseDetailDialogProps) {
  return (
    <Dialog open={Boolean(expense)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {expense && (
          <>
            <DialogHeader>
              <DialogTitle>
                Gasto del {formatShortDate(expense.serviceDate, true)} ·{' '}
                {formatPlate(expense.busPlate)}
              </DialogTitle>
              <DialogDescription>Esto fue lo que se pagó en el taller.</DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-2">
              {expense.lines.map((line, index) => (
                <li
                  key={index}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-background p-3.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">{line.categoryName}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {LINE_KIND_LABELS[line.kind]}
                      {line.description && ` · ${line.description}`}
                    </span>
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatQuetzales(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Mano de obra</dt>
              <dd className="m-0 font-mono tabular-nums">{formatQuetzales(expense.laborTotal)}</dd>
              <dt className="text-muted-foreground">Repuestos</dt>
              <dd className="m-0 font-mono tabular-nums">{formatQuetzales(expense.partsTotal)}</dd>
              <dt className="font-bold">Total</dt>
              <dd className="m-0 font-mono font-bold tabular-nums">
                {formatQuetzales(expense.total)}
              </dd>
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
