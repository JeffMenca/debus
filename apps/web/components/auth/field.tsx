import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FieldProps {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  // Extra content on the label row, such as a "forgot it" link.
  aside?: ReactNode;
  children: ReactNode;
}

export const errorId = (id: string) => `${id}-error`;

// Props a control needs so assistive technology reads its error.
export const invalidProps = (id: string, error: string | undefined) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': errorId(id) } : {};

export function Field({ id, label, optional, error, aside, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}
        </Label>
        {aside}
      </div>
      {children}
      {error && (
        <p id={errorId(id)} role="alert" className="text-[13px] text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
