import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RentalRequestScreen } from '@/components/rentals/rental-request-screen';

export const metadata: Metadata = { title: 'Alquila un bus · debus' };

// useSearchParams, which holds the page of the history, needs a Suspense boundary on a prerendered page.
export default function RentalPage() {
  return (
    <Suspense>
      <RentalRequestScreen />
    </Suspense>
  );
}
