import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { ExpensesReport } from '@/components/system-reports/expenses-report';

export const metadata: Metadata = { title: 'Gastos por sucursal · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function ExpensesReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Gastos por sucursal" />}>
        <ExpensesReport />
      </Suspense>
    </RoleGate>
  );
}
