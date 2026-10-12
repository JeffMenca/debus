import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { DriversScreen } from '@/components/fleet/drivers-screen';

export const metadata: Metadata = { title: 'Choferes · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function DriversPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Choferes" />}>
        <DriversScreen />
      </Suspense>
    </RoleGate>
  );
}
