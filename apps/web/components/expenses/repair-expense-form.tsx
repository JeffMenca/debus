'use client';

import { todayInGuatemala } from '@debus/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { KPI_TONE_SURFACES, type KpiTone } from '@/components/data/kpi-card';
import { DateField } from '@/components/forms/date-field';
import { PageHeader } from '@/components/layout/page-header';
import { OPTIONS_PAGE, useOptionSearch } from '@/components/trips/option-search';
import { OptionSelect } from '@/components/trips/option-select';
import { Button } from '@/components/ui/button';
import { useBusesPage } from '@/hooks/use-buses';
import { useExpenseCategoriesPage } from '@/hooks/use-expense-categories';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { useCreateRepairExpense } from '@/hooks/use-repair-expenses';
import { messageOf } from '@/lib/api/client';
import {
  type ExpenseValues,
  emptyLine,
  liveTotals,
  toCreateRepairExpenseRequest,
  validateExpense,
} from '@/lib/expenses/expense-form';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ExpenseLines, lineFieldId } from './expense-lines';

const focusField = (id: string) => document.getElementById(id)?.focus();

// The form of a repair expense: the bus and the day, then one line per thing that was paid.
export function RepairExpenseForm() {
  const router = useRouter();
  const branch = useOwnBranch();
  const create = useCreateRepairExpense();
  const [busSearch, setBusSearch, busTerm] = useOptionSearch();
  const [categorySearch, setCategorySearch, categoryTerm] = useOptionSearch();
  const buses = useBusesPage({
    status: 'all',
    ...(busTerm && { q: busTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const categories = useExpenseCategoriesPage({
    status: 'active',
    ...(categoryTerm && { q: categoryTerm }),
    ...OPTIONS_PAGE,
  }).data;

  // Generated once: if saving fails and the person tries again, the service sees the same expense
  // and never records it twice.
  const [expenseId] = useState(() => crypto.randomUUID());
  const lineCount = useRef(1);
  const [values, setValues] = useState<ExpenseValues>(() => ({
    busId: '',
    serviceDate: todayInGuatemala(),
    lines: [emptyLine('0')],
  }));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; onBus: boolean } | null>(null);

  const problems = attempted ? validateExpense(values) : null;
  const totals = liveTotals(values.lines);

  function firstProblemField(found: NonNullable<typeof problems>): string | undefined {
    if (found.busId) return 'expense-bus';
    if (found.serviceDate) return 'expense-date';
    const index = found.total ? 0 : Number(Object.keys(found.lines)[0]);
    const line = values.lines[index];
    if (!line) return undefined;
    return lineFieldId(line.key, found.lines[index]?.categoryId ? 'category' : 'amount');
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setAttempted(true);
    setRefusal(null);
    const found = validateExpense(values);
    if (found) {
      const field = firstProblemField(found);
      if (field) focusField(field);
      return;
    }
    setSaving(true);
    try {
      await create.mutateAsync(toCreateRepairExpenseRequest(values, expenseId));
    } catch (error) {
      const message = messageOf(error);
      const onBus = /\bbus\b/i.test(message);
      setRefusal({ message, onBus });
      setSaving(false);
      if (onBus) setTimeout(() => focusField('expense-bus'), 0);
      return;
    }
    toast.success('Gasto registrado.');
    router.push('/sucursal/gastos');
  }

  const set = (patch: Partial<ExpenseValues>) => setValues({ ...values, ...patch });

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Finanzas · ${branch.name}` : 'Finanzas'}
        title="Nuevo gasto de taller"
      />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {refusal && !refusal.onBus && <FormAlert tone="error">{refusal.message}</FormAlert>}
        <section className="flex flex-col gap-4 rounded-[26px] bg-card p-5 sm:p-6">
          <h2 className="font-display text-2xl font-bold">Datos del servicio</h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <OptionSelect
              id="expense-bus"
              label="Bus"
              placeholder="Elige el bus"
              options={(buses?.items ?? []).map((item) => ({
                value: item.id,
                label: `${formatPlate(item.plate)}${item.active ? '' : ' (desactivado)'}`,
                disabled: !item.active,
              }))}
              total={buses?.total ?? 0}
              value={values.busId}
              onChange={(busId) => set({ busId })}
              search={busSearch}
              onSearchChange={setBusSearch}
              searchLabel="Buscar bus"
              emptyMessage="No hay buses registrados. Registra uno en Buses."
              error={problems?.busId ?? (refusal?.onBus ? refusal.message : undefined)}
            />
            <DateField
              id="expense-date"
              label="Fecha del servicio"
              value={values.serviceDate}
              max={todayInGuatemala()}
              onChange={(serviceDate) => set({ serviceDate })}
              error={problems?.serviceDate}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-[26px] bg-card p-5 sm:p-6">
          <h2 className="font-display text-2xl font-bold">Qué se pagó</h2>
          <ExpenseLines
            lines={values.lines}
            problems={problems?.lines ?? {}}
            categories={categories?.items ?? []}
            totalCategories={categories?.total ?? 0}
            categorySearch={categorySearch}
            onCategorySearchChange={setCategorySearch}
            onChange={(index, patch) =>
              set({
                lines: values.lines.map((line, position) =>
                  position === index ? { ...line, ...patch } : line,
                ),
              })
            }
            onRemove={(index) =>
              set({ lines: values.lines.filter((_, position) => position !== index) })
            }
            onAdd={() => set({ lines: [...values.lines, emptyLine(String(lineCount.current++))] })}
          />
          <div
            role="status"
            aria-label="Total del gasto"
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          >
            <TotalTile label="Mano de obra" value={totals.laborTotal} tone="mango" />
            <TotalTile label="Repuestos" value={totals.partsTotal} tone="sky" />
            <TotalTile
              label="Total"
              value={totals.total}
              tone="coral"
              className="col-span-2 sm:col-span-1"
            />
          </div>
          {problems?.total && <FormAlert tone="error">{problems.total}</FormAlert>}
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button asChild variant="ghost">
            <Link href="/sucursal/gastos">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar gasto'}
          </Button>
        </div>
      </form>
    </>
  );
}

function TotalTile({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: number;
  tone: KpiTone;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col gap-1 rounded-[18px] p-4', KPI_TONE_SURFACES[tone], className)}
    >
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="font-display text-[26px] leading-tight font-bold">
        {formatQuetzales(value)}
      </span>
    </div>
  );
}
