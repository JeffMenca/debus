import { RoleGate } from '@/components/auth/role-gate';
import { ClientShell } from '@/components/account/client-shell';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate allowed={['CLIENT']}>
      <ClientShell>{children}</ClientShell>
    </RoleGate>
  );
}
