import type { Metadata } from 'next';
import { RoleGate } from '@/components/auth/role-gate';
import { ReportsIndex } from '@/components/branch-reports/reports-index';

export const metadata: Metadata = { title: 'Reportes · debus' };

export default function ReportsPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <ReportsIndex />
    </RoleGate>
  );
}
