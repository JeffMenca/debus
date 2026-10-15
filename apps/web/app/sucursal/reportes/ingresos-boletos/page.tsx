import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { TicketIncomeReport } from '@/components/branch-reports/ticket-income-report';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Ingresos por boletos · debus' };

// useSearchParams, which holds the filters, needs a Suspense boundary on a prerendered page.
export default function TicketIncomeReportPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Ingresos por boletos" />}>
        <TicketIncomeReport />
      </Suspense>
    </RoleGate>
  );
}
