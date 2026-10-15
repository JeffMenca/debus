import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { RentalIncomeReport } from '@/components/branch-reports/rental-income-report';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Ingresos por alquiler · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function RentalIncomeReportPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Ingresos por alquiler" />}>
        <RentalIncomeReport />
      </Suspense>
    </RoleGate>
  );
}
