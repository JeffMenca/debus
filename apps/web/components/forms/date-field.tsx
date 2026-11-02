'use client';

import { CalendarDays } from 'lucide-react';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { inputRules } from '@/lib/forms/input-rules';

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  hint?: string;
  error?: string;
}

// Every date a person picks goes through here; the parent starts `value` on todayInGuatemala().
export function DateField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  hint = 'Hoy por defecto, siempre editable',
  error,
}: DateFieldProps) {
  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <CalendarDays
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-primary"
        />
        <Input
          id={id}
          type="date"
          rule={inputRules.native}
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          className="pl-11 font-mono tabular-nums"
          {...invalidProps(id, error)}
        />
      </div>
      {!error && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Field>
  );
}
