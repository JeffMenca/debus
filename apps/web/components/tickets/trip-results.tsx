'use client';

import type { AvailableTripPage, PageQuery } from '@debus/contracts';
import { ErrorAlert } from '@/components/data/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PageBar } from './page-bar';
import { TripResultCard } from './trip-result-card';

interface TripResultsProps {
  query: PageQuery;
  page: AvailableTripPage | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRetry: () => void;
  onPage: (patch: Partial<PageQuery>) => void;
  // The search of the address, carried to the seats of each trip.
  search: string;
}

export function TripResults({
  query,
  page,
  loading,
  refreshing,
  error,
  onRetry,
  onPage,
  search,
}: TripResultsProps) {
  if (error) return <ErrorAlert message={error} onRetry={onRetry} />;
  if (loading || !page) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-[124px] rounded-[26px]" />
        ))}
      </div>
    );
  }
  if (page.items.length === 0) {
    return (
      <p className="rounded-[26px] bg-card px-6 py-10 text-center text-muted-foreground">
        No hay viajes para ese día. Prueba con otra fecha o cambia el origen o el destino.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label="Viajes a la venta"
        className={cn('flex flex-col gap-3 transition-opacity', refreshing && 'opacity-60')}
      >
        {page.items.map((trip) => (
          <TripResultCard key={trip.tripId} trip={trip} search={search} />
        ))}
      </ul>
      <PageBar query={query} total={page.total} shown={page.items.length} onChange={onPage} />
    </div>
  );
}
