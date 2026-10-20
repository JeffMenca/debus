import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListPageSkeleton } from '@/components/data/list-page-skeleton';
import { CounterScreen } from '@/components/tickets/counter-screen';

export const metadata: Metadata = { title: 'Ventanilla · debus' };

// The branch layout already lets in only the branch admin and the cashier. useSearchParams, which
// holds the list and the trip being sold, needs a Suspense boundary on a prerendered page.
export default function CounterPage() {
  return (
    <Suspense fallback={<ListPageSkeleton title="Ventanilla" />}>
      <CounterScreen />
    </Suspense>
  );
}
