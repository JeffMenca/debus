import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { TripsScreen } from '@/components/trips/trips-screen';

export const metadata: Metadata = { title: 'Viajes · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function TripsPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Viajes" />}>
        <TripsScreen />
      </Suspense>
    </RoleGate>
  );
}
