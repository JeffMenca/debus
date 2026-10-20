'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { CounterSale } from './counter-sale';
import { CounterTrips } from './counter-trips';

const TRIP_PARAM = 'viaje';

// The counter in two steps: the trip, then its seats and the payment. The trip being sold lives in
// the address, so going back in the browser returns to the list as it was.
export function CounterScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branch = useOwnBranch();
  const tripId = searchParams.get(TRIP_PARAM);

  const go = useCallback(
    (nextTrip: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextTrip) params.set(TRIP_PARAM, nextTrip);
      else params.delete(TRIP_PARAM);
      const search = params.toString();
      router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Operación · ${branch.name}` : 'Operación'}
        title="Ventanilla"
      />
      {tripId ? (
        <CounterSale key={tripId} tripId={tripId} onBack={() => go(null)} />
      ) : (
        <CounterTrips onChoose={go} />
      )}
    </>
  );
}
