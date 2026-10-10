import type { Metadata } from 'next';
import { RoleHome } from '@/components/auth/role-home';

export const metadata: Metadata = { title: 'Administración · debus' };

export default function AdminPage() {
  return <RoleHome allowed={['SYSTEM_ADMIN']} />;
}
