import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { RepairCategoryReport } from '@/components/system-reports/repair-category-report';

export const metadata: Metadata = { title: 'Gastos de taller por categoría · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function RepairCategoryReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Gastos de taller por categoría" />}>
        <RepairCategoryReport />
      </Suspense>
    </RoleGate>
  );
}
