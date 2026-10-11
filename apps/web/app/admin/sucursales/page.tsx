import type { Metadata } from 'next';
import { BranchesScreen } from '@/components/admin/branches-screen';

export const metadata: Metadata = { title: 'Sucursales · debus' };

export default function BranchesPage() {
  return <BranchesScreen />;
}
