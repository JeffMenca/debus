import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { RoutesScreen } from '@/components/fleet/routes-screen';

export const metadata: Metadata = { title: 'Rutas · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function RoutesPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Rutas" />}>
        <RoutesScreen />
      </Suspense>
    </RoleGate>
  );
}
