import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UsersScreen } from '@/components/admin/users-screen';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Usuarios · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function UsersPage() {
  return (
    <Suspense fallback={<ListPageSkeleton title="Usuarios" />}>
      <UsersScreen />
    </Suspense>
  );
}
