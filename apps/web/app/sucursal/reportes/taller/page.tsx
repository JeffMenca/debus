import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { RepairReport } from '@/components/branch-reports/repair-report';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Gastos de taller por bus · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function RepairReportPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Gastos de taller por bus" />}>
        <RepairReport />
      </Suspense>
    </RoleGate>
  );
}
