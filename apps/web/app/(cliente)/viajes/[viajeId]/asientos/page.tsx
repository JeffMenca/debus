import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PurchaseScreen } from '@/components/tickets/purchase-screen';

export const metadata: Metadata = { title: 'Elige tus asientos · debus' };

// useSearchParams, which holds the search to go back to, needs a Suspense boundary.
export default async function SeatsPage({ params }: PageProps<'/viajes/[viajeId]/asientos'>) {
  const { viajeId } = await params;
  return (
    <Suspense>
      <PurchaseScreen tripId={viajeId} />
    </Suspense>
  );
}
