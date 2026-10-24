import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { BranchRentalsScreen } from '@/components/rentals/branch-rentals-screen';

export const metadata: Metadata = { title: 'Alquileres · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function BranchRentalsPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Alquileres" />}>
        <BranchRentalsScreen />
      </Suspense>
    </RoleGate>
  );
}
