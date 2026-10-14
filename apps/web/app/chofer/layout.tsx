import { RoleGate } from '@/components/auth/role-gate';
import { BranchShell } from '@/components/layout/branch-shell';

export default function DriverLayout({ children }: LayoutProps<'/chofer'>) {
  return (
    <RoleGate allowed={['DRIVER']}>
      <BranchShell>{children}</BranchShell>
    </RoleGate>
  );
}
