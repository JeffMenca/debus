import { Skeleton } from '@/components/ui/skeleton';

// Stands in for a KpiCard while its number loads.
export function KpiSkeleton() {
  return (
    <div aria-label="Cargando" className="rounded-[22px] bg-card p-4">
      <Skeleton className="h-[74px]" />
    </div>
  );
}
