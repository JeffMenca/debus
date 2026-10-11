import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BranchesScreen } from '@/components/admin/branches-screen';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Sucursales · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function BranchesPage() {
  return (
    <Suspense fallback={<ListPageSkeleton title="Sucursales" />}>
      <BranchesScreen />
    </Suspense>
  );
}
