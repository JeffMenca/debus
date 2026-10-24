import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { TopRoutesReport } from '@/components/system-reports/top-routes-report';

export const metadata: Metadata = { title: 'Rutas más demandadas · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function TopRoutesReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Rutas más demandadas" />}>
        <TopRoutesReport />
      </Suspense>
    </RoleGate>
  );
}
