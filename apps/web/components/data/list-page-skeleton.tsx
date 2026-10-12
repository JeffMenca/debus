import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';

// What a list page shows while Next reads its address (the filters live in the URL).
export function ListPageSkeleton({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div aria-label="Cargando" className="flex flex-col gap-3 rounded-[26px] bg-card p-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-11" />
        ))}
      </div>
    </>
  );
}
