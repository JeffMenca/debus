import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { IncomeReport } from '@/components/system-reports/income-report';

export const metadata: Metadata = { title: 'Ingresos por sucursal · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function IncomeReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Ingresos por sucursal" />}>
        <IncomeReport />
      </Suspense>
    </RoleGate>
  );
}
