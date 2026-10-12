import { RoleGate } from '@/components/auth/role-gate';
import { BranchShell } from '@/components/layout/branch-shell';

export default function BranchLayout({ children }: LayoutProps<'/sucursal'>) {
  return (
    <RoleGate allowed={['BRANCH_ADMIN', 'CASHIER', 'DRIVER']}>
      <BranchShell>{children}</BranchShell>
    </RoleGate>
  );
}
