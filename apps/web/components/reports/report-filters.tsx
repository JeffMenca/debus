import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ReportFiltersProps {
  // Something narrows the report, so there is something to clear.
  narrowed: boolean;
  onClear: () => void;
  children: ReactNode;
}

export function ReportFilters({ narrowed, onClear, children }: ReportFiltersProps) {
  return (
    <section
      aria-label="Filtros"
      className="grid animate-arrive grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] items-end gap-3 rounded-[22px] bg-card p-4 motion-reduce:animate-none"
    >
      {children}
      {narrowed && (
        <Button variant="ghost" onClick={onClear} className="justify-self-start">
          Limpiar filtros
        </Button>
      )}
    </section>
  );
}
