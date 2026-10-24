import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { RoutesMapReport } from '@/components/system-reports/routes-map-report';

export const metadata: Metadata = { title: 'Mapa de rutas · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function RoutesMapReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Mapa de rutas" />}>
        <RoutesMapReport />
      </Suspense>
    </RoleGate>
  );
}
