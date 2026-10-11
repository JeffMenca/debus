import type { Metadata } from 'next';
import { RoleHome } from '@/components/auth/role-home';

export const metadata: Metadata = { title: 'Sucursal · debus' };

export default function BranchPage() {
  return <RoleHome />;
}
