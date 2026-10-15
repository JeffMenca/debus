import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { BusesReport } from '@/components/branch-reports/buses-report';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Listado de buses · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function BusesReportPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Listado de buses" />}>
        <BusesReport />
      </Suspense>
    </RoleGate>
  );
}
