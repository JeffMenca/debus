import type { Metadata } from 'next';
import { BranchForm } from '@/components/admin/branch-form';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Nueva sucursal · debus' };

export default function NewBranchPage() {
  return (
    <>
      <PageHeader eyebrow="Sucursales" title="Nueva sucursal" />
      <BranchForm mode="create" />
    </>
  );
}
