import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { ProfitReport } from '@/components/system-reports/profit-report';

export const metadata: Metadata = { title: 'Ganancias · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function ProfitReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Ganancias" />}>
        <ProfitReport />
      </Suspense>
    </RoleGate>
  );
}
