import type { Metadata } from 'next';
import { BranchEditScreen } from '@/components/admin/branch-edit-screen';

export const metadata: Metadata = { title: 'Sucursal · debus' };

export default async function BranchPage({ params }: PageProps<'/admin/sucursales/[id]'>) {
  const { id } = await params;
  return <BranchEditScreen id={id} />;
}
