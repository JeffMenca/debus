import { RoleGate } from '@/components/auth/role-gate';
import { AppShell } from '@/components/layout/app-shell';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <RoleGate allowed={['SYSTEM_ADMIN']}>
      <AppShell>{children}</AppShell>
    </RoleGate>
  );
}
