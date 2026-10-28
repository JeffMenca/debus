import { RoleGate } from '@/components/auth/role-gate';
import { BranchShell } from '@/components/layout/branch-shell';

// Staff only: a client edits the same profile in their account. The branch shell shows the branch
// of whoever has one and no context for the system admin.
export default function ProfileLayout({ children }: LayoutProps<'/perfil'>) {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'DRIVER']}>
      <BranchShell>{children}</BranchShell>
    </RoleGate>
  );
}
