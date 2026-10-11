'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranch } from '@/hooks/use-branches';
import { ApiError, messageOf } from '@/lib/api/client';
import { BranchForm } from './branch-form';

export function BranchEditScreen({ id }: { id: string }) {
  const branch = useBranch(id);

  if (branch.isPending) {
    return (
      <div aria-label="Cargando" className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-96 rounded-[26px]" />
      </div>
    );
  }
  if (branch.isError || !branch.data) {
    const missing = branch.error instanceof ApiError && branch.error.status === 404;
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-[26px] bg-rose-100 p-6 text-rose-700"
      >
        <p>{missing ? 'No encontramos esa sucursal.' : messageOf(branch.error)}</p>
        {missing ? (
          <Button asChild variant="secondary">
            <Link href="/admin/sucursales">Volver a sucursales</Link>
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => void branch.refetch()}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  return (
    <>
      <PageHeader eyebrow="Sucursales" title={branch.data.name} />
      <BranchForm mode="edit" branch={branch.data} />
    </>
  );
}
