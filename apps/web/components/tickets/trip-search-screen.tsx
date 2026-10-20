'use client';

import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { messageOf } from '@/lib/api/client';
import { type TripSearch, readTripSearch, writeTripSearch } from '@/lib/tickets/trip-search-params';
import { useTripPlaces, useTripsOnSale } from '@/lib/tickets/trips-api';
import { DayStrip } from './day-strip';
import { TripResults } from './trip-results';
import { TripSearchForm } from './trip-search-form';
import { TripSearchHero } from './trip-search-hero';

function subtitleOf({ origin, destination }: TripSearch): string {
  if (origin && destination) return `${origin} a ${destination}`;
  if (origin) return `Desde ${origin}, todos los destinos`;
  if (destination) return `Hacia ${destination}, cualquier origen`;
  return 'Todos los destinos, cualquier origen';
}

// /viajes: the search lives in the address, so a reload or a shared link shows the same results.
export function TripSearchScreen() {
  const [search, update] = useUrlQuery(readTripSearch, writeTripSearch);
  const places = useTripPlaces();
  const trips = useTripsOnSale(search);
  usePageInRange(trips.data, update);
  const address = writeTripSearch(search).toString();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col">
        <TripSearchHero />
        {/* A new address starts a new draft, so going back in the browser shows its own search. */}
        <TripSearchForm key={address} search={search} places={places.data} onSearch={update} />
      </div>
      <section aria-labelledby="trip-results-title" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id="trip-results-title"
              className="font-display text-[30px] font-bold sm:text-[36px]"
            >
              Viajes disponibles
            </h2>
            <p className="text-sm text-muted-foreground">{subtitleOf(search)}</p>
          </div>
          <DayStrip value={search.date} onChange={(date) => update({ date })} />
        </div>
        <TripResults
          query={search}
          page={trips.data}
          loading={trips.isPending}
          refreshing={trips.isPlaceholderData}
          error={trips.isError ? messageOf(trips.error) : null}
          onRetry={() => void trips.refetch()}
          onPage={update}
          search={address}
        />
      </section>
    </div>
  );
}
