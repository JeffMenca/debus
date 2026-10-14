'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTripsPage } from '@/hooks/use-trips';

// A driver has one bus on the road at a time; five is the limit the list asks for, never more.
const ON_THE_ROAD = { status: 'IN_TRANSIT', page: 1, pageSize: 5 } as const;

// What a driver on the road wants first: their trip, and the way to register its arrival.
export function OnTheRoadBanner() {
  const road = useTripsPage(ON_THE_ROAD).data?.items ?? [];
  if (road.length === 0) return null;
  return (
    <section
      aria-label="Viaje en ruta"
      className="flex animate-arrive flex-col gap-3 rounded-[26px] bg-mint-100 p-5 text-mint-700 motion-reduce:animate-none"
    >
      {road.map((trip) => (
        <div key={trip.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Tu viaje en ruta</span>
            <span className="font-display text-xl font-bold text-foreground">
              {trip.originName} a {trip.destinationName}
            </span>
          </div>
          <Link
            href={`/chofer/viajes/${trip.id}`}
            className="inline-flex items-center gap-1.5 font-semibold text-mint-700 underline underline-offset-4"
          >
            Registrar llegada
            <ArrowRight aria-hidden strokeWidth={1.75} className="size-4" />
          </Link>
        </div>
      ))}
    </section>
  );
}
