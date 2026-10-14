import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorAlert } from '@/components/data/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: ReactNode;
  // What sits on the right of the title: a link, a timestamp.
  aside?: ReactNode;
  className?: string;
  // The content shown belongs to a previous question while the new answer arrives.
  refreshing?: boolean;
  children: ReactNode;
}

// A white block of the branch panel, headed by its title.
export function Panel({ title, aside, className, refreshing, children }: PanelProps) {
  return (
    <section
      aria-busy={refreshing || undefined}
      className={cn(
        'flex animate-arrive flex-col gap-4 rounded-[26px] bg-card p-5 motion-reduce:animate-none sm:p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-[22px] font-bold">{title}</h2>
        {aside}
      </div>
      <div
        className={cn(
          'flex flex-col gap-4',
          refreshing && 'opacity-60 transition-opacity motion-reduce:transition-none',
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function PanelLoading() {
  return (
    <div aria-label="Cargando" className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl bg-background px-4 py-6 text-center text-muted-foreground">
      {children}
    </p>
  );
}

interface PanelContentProps<T extends { items: readonly unknown[] }> {
  query: UseQueryResult<T>;
  errorMessage: string;
  empty: ReactNode;
  children: (data: T) => ReactNode;
}

// The loading, error and empty states every panel list shares; `children` draws the rest.
export function PanelContent<T extends { items: readonly unknown[] }>({
  query,
  errorMessage,
  empty,
  children,
}: PanelContentProps<T>) {
  if (query.isPending) return <PanelLoading />;
  if (query.isError) {
    return <ErrorAlert message={errorMessage} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) return <PanelEmpty>{empty}</PanelEmpty>;
  return children(query.data);
}
