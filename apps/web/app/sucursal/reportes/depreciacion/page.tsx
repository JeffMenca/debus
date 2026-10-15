import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { DepreciationReport } from '@/components/branch-reports/depreciation-report';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Depreciación por bus · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function DepreciationReportPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Depreciación por bus" />}>
        <DepreciationReport />
      </Suspense>
    </RoleGate>
  );
}
