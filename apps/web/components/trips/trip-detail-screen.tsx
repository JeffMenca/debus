'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ErrorAlert } from '@/components/data/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrip } from '@/hooks/use-trip';
import { ApiError, messageOf } from '@/lib/api/client';
import { formatPlate, formatShortDate } from '@/lib/format';
import { splitGuatemala } from '@/lib/trips/schedule';
import { ArrivalCard } from './arrival-card';
import { DeleteTripCard } from './delete-trip-card';
import { DepartureCard } from './departure-card';
import { TripHero } from './trip-hero';

export type TripAudience = 'branch' | 'driver';

const BACK = {
  branch: { href: '/sucursal/viajes', label: 'Viajes' },
  driver: { href: '/chofer', label: 'Mis viajes' },
} as const;

function Breadcrumb({ audience, current }: { audience: TripAudience; current?: string }) {
  const back = BACK[audience];
  return (
    <nav
      aria-label="Ruta de navegación"
      className="flex animate-arrive items-center gap-2 text-sm text-muted-foreground motion-reduce:animate-none"
    >
      <Link href={back.href} className="hover:text-foreground">
        {back.label}
      </Link>
      {current && (
        <>
          <ChevronRight aria-hidden strokeWidth={1.75} className="size-3.5" />
          <span className="font-mono text-foreground">{current}</span>
        </>
      )}
    </nav>
  );
}

function DetailSkeleton() {
  return (
    <div aria-label="Cargando" className="flex flex-col gap-4">
      <Skeleton className="h-[230px] rounded-[30px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-[26px]" />
        <Skeleton className="h-[260px] rounded-[26px]" />
      </div>
    </div>
  );
}

// The trip with its departure, arrival and, for the branch admin, the way to delete it.
export function TripDetailScreen({ tripId, audience }: { tripId: string; audience: TripAudience }) {
  const trip = useTrip(tripId);
  const notFound = trip.error instanceof ApiError && trip.error.status === 404;

  if (trip.isError) {
    return (
      <>
        <Breadcrumb audience={audience} />
        {notFound ? (
          <section className="flex flex-col items-start gap-3 rounded-[26px] bg-card p-6">
            <p className="text-lg font-semibold">No encontramos ese viaje.</p>
            <Link href={BACK[audience].href} className="font-semibold text-primary">
              Volver a los viajes
            </Link>
          </section>
        ) : (
          <ErrorAlert message={messageOf(trip.error)} onRetry={() => void trip.refetch()} />
        )}
      </>
    );
  }
  if (trip.isPending) {
    return (
      <>
        <Breadcrumb audience={audience} />
        <DetailSkeleton />
      </>
    );
  }

  const detail = trip.data;
  return (
    <>
      <Breadcrumb
        audience={audience}
        current={`${formatPlate(detail.busPlate)} · ${formatShortDate(splitGuatemala(detail.departureAt).day)}`}
      />
      <TripHero trip={detail} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <DepartureCard trip={detail} />
        <ArrivalCard trip={detail} />
      </div>
      {audience === 'branch' && <DeleteTripCard trip={detail} />}
    </>
  );
}
