'use client';

import { ChevronRight } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

// Which rows are open lives outside the columns: columns that change with it would be rebuilt on
// every click and the button that was pressed would lose the keyboard focus.
export interface RowExpansion {
  expanded: ReadonlySet<string>;
  toggle: (id: string) => void;
}

export const ExpansionContext = createContext<RowExpansion>({
  expanded: new Set(),
  toggle: () => undefined,
});

export function useRowExpansion(): RowExpansion {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setExpanded((open) => {
        const next = new Set(open);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  return useMemo(() => ({ expanded, toggle }), [expanded, toggle]);
}

// The button that opens a row: it is the way in for the keyboard and names the row for a screen reader.
export function ExpandToggle({ id, children }: { id: string; children: ReactNode }) {
  const { expanded, toggle } = useContext(ExpansionContext);
  const open = expanded.has(id);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => toggle(id)}
      className="flex items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ChevronRight
        aria-hidden
        strokeWidth={1.75}
        className={cn(
          'size-4.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
          open && 'rotate-90',
        )}
      />
      {children}
    </button>
  );
}
