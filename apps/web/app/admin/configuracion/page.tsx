import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsScreen } from '@/components/admin/settings-screen';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';

export const metadata: Metadata = { title: 'Configuración · debus' };

// useSearchParams, which holds the history page, needs a Suspense boundary on a prerendered page.
export default function SettingsPage() {
  return (
    <Suspense fallback={<ListPageSkeleton title="Configuración" />}>
      <SettingsScreen />
    </Suspense>
  );
}
