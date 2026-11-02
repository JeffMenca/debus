import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { ArchitectureReport } from '@/components/system-reports/architecture-report';

export const metadata: Metadata = { title: 'Arquitectura · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function ArchitectureReportPage() {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Arquitectura" />}>
        <ArchitectureReport />
      </Suspense>
    </RoleGate>
  );
}
