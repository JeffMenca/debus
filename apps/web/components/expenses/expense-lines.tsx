'use client';

import { type ExpenseCategory } from '@debus/contracts';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OptionSelect } from '@/components/forms/option-select';
import {
  type ExpenseProblems,
  LINE_KIND_LABELS,
  type LineKind,
  type LineValues,
} from '@/lib/expenses/expense-form';

export const lineFieldId = (key: string, field: 'category' | 'kind' | 'description' | 'amount') =>
  `expense-line-${key}-${field}`;

interface ExpenseLinesProps {
  lines: LineValues[];
  problems: ExpenseProblems['lines'];
  categories: ExpenseCategory[];
  totalCategories: number;
  categorySearch: string;
  onCategorySearchChange: (search: string) => void;
  onChange: (index: number, patch: Partial<LineValues>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

// The lines of the expense: each one is a category, whether it was labour or a part, what was done and what it cost.
export function ExpenseLines({
  lines,
  problems,
  categories,
  totalCategories,
  categorySearch,
  onCategorySearchChange,
  onChange,
  onRemove,
  onAdd,
}: ExpenseLinesProps) {
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => {
        const position = index + 1;
        const error = problems[index];
        return (
          <div
            key={line.key}
            role="group"
            aria-label={`Línea ${position}`}
            className="flex flex-col gap-3 rounded-2xl bg-background p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-lg font-bold">Línea {position}</span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Quitar línea ${position}`}
                disabled={lines.length === 1}
                onClick={() => onRemove(index)}
              >
                <X aria-hidden strokeWidth={1.75} className="size-4.5" />
                Quitar
              </Button>
            </div>
            <div
              data-testid="line-fields"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,0.9fr)]"
            >
              <OptionSelect
                id={lineFieldId(line.key, 'category')}
                label="Categoría"
                placeholder="Elige la categoría"
                options={categories.map((item) => ({ value: item.id, label: item.name }))}
                total={totalCategories}
                value={line.categoryId}
                onChange={(categoryId) => onChange(index, { categoryId })}
                search={categorySearch}
                onSearchChange={onCategorySearchChange}
                searchLabel="Buscar categoría"
                emptyMessage="No hay categorías activas. Pídele al administrador del sistema que cree una."
                error={error?.categoryId}
              />
              <Field id={lineFieldId(line.key, 'kind')} label="Tipo">
                <Select
                  value={line.kind}
                  onValueChange={(kind) => onChange(index, { kind: kind as LineKind })}
                >
                  <SelectTrigger id={lineFieldId(line.key, 'kind')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LINE_KIND_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id={lineFieldId(line.key, 'description')} label="Descripción" optional>
                <Input
                  id={lineFieldId(line.key, 'description')}
                  autoComplete="off"
                  maxLength={200}
                  value={line.description}
                  onChange={(event) => onChange(index, { description: event.target.value })}
                />
              </Field>
              <Field id={lineFieldId(line.key, 'amount')} label="Monto (Q)" error={error?.amount}>
                <Input
                  id={lineFieldId(line.key, 'amount')}
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.amount}
                  onChange={(event) => onChange(index, { amount: event.target.value })}
                  className="font-mono tabular-nums"
                  {...invalidProps(lineFieldId(line.key, 'amount'), error?.amount)}
                />
              </Field>
            </div>
          </div>
        );
      })}
      <div>
        <Button type="button" variant="secondary" onClick={onAdd}>
          <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
          Agregar línea
        </Button>
      </div>
    </div>
  );
}
