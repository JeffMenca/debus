'use client';

import { Clock } from 'lucide-react';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface TimeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

// The hour of a trip, in Guatemala; it pairs with a DateField for the day.
export function TimeField({ id, label, value, onChange, error }: TimeFieldProps) {
  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <Clock
          aria-hidden
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-primary"
        />
        <Input
          id={id}
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pl-11 font-mono tabular-nums"
          {...invalidProps(id, error)}
        />
      </div>
    </Field>
  );
}
