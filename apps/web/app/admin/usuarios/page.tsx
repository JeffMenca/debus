import type { Metadata } from 'next';
import { UsersScreen } from '@/components/admin/users-screen';

export const metadata: Metadata = { title: 'Usuarios · debus' };

export default function UsersPage() {
  return <UsersScreen />;
}
