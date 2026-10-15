import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { DriversReport } from '@/components/branch-reports/drivers-report';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Listado de choferes · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function DriversReportPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Listado de choferes" />}>
        <DriversReport />
      </Suspense>
    </RoleGate>
  );
}
