import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { DriverTripsScreen } from '@/components/trips/driver-trips-screen';

export const metadata: Metadata = { title: 'Mis viajes · debus' };

// useSearchParams, which holds the list state, needs a Suspense boundary on a prerendered page.
export default function DriverHomePage() {
  return (
    <Suspense fallback={<ListPageSkeleton title="Mis viajes" />}>
      <DriverTripsScreen />
    </Suspense>
  );
}
