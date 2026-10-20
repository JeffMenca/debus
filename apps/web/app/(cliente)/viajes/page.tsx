import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TripSearchScreen } from '@/components/tickets/trip-search-screen';

export const metadata: Metadata = { title: 'Viajes · debus' };

// useSearchParams, which holds the search and its page, needs a Suspense boundary on a prerendered page.
export default function TripsPage() {
  return (
    <Suspense>
      <TripSearchScreen />
    </Suspense>
  );
}
