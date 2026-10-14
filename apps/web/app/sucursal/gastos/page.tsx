import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RoleGate } from '@/components/auth/role-gate';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { RepairExpensesScreen } from '@/components/expenses/repair-expenses-screen';

export const metadata: Metadata = { title: 'Gastos de taller · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function ExpensesPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <Suspense fallback={<ListPageSkeleton title="Gastos de taller" />}>
        <RepairExpensesScreen />
      </Suspense>
    </RoleGate>
  );
}
