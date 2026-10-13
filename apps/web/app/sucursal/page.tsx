import type { Metadata } from 'next';
import { BranchHome } from '@/components/branch/branch-home';

export const metadata: Metadata = { title: 'Sucursal · debus' };

export default function BranchPage() {
  return <BranchHome />;
}
