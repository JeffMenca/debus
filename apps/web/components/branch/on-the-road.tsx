'use client';

import { MAX_PAGE_SIZE, type Trip } from '@debus/contracts';
import { Bus } from '@/components/brand/bus';
import { useNow } from '@/hooks/use-now';
import { useTripsPage } from '@/hooks/use-trips';
import { formatPlate } from '@/lib/format';
import { progressOf, splitGuatemala } from '@/lib/trips/schedule';
import { cn } from '@/lib/utils';
import { Panel, PanelContent } from './panel';

const REFRESH_MS = 60_000;
// Every bus on the road, whatever day it left: a branch has few at a time.
const ON_THE_ROAD = { status: 'IN_TRANSIT', page: 1, pageSize: MAX_PAGE_SIZE } as const;

function Lane({ trip, now }: { trip: Trip; now: number }) {
  const rental = trip.type === 'RENTAL';
  const percent = Math.round(progressOf(trip.departureAt, trip.estimatedArrivalAt, now) * 100);
  const plate = formatPlate(trip.busPlate);
  return (
    <li
      aria-label={`${trip.originName} a ${trip.destinationName}`}
      className={cn(
        'grid items-end gap-x-5 gap-y-1 rounded-[18px] px-4 py-3 sm:grid-cols-[250px_1fr_64px]',
        rental ? 'bg-coral-100 text-coral-700' : 'bg-background',
      )}
    >
      <span className="flex flex-col gap-0.5 pb-1">
        <span className="text-sm font-bold text-foreground">
          {rental && 'Alquiler · '}
          {trip.originName} → {trip.destinationName}
        </span>
        <span className="font-mono text-xs">
          {plate} · salió {splitGuatemala(trip.departureAt).time}
        </span>
      </span>
      <div
        role="progressbar"
        aria-label={`Avance de ${plate}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="relative h-11"
      >
        <svg
          aria-hidden
          preserveAspectRatio="none"
          viewBox="0 0 100 4"
          className={cn(
            'absolute right-0 bottom-1.5 left-0 h-1 w-full',
            rental ? 'text-coral-300' : 'text-border',
          )}
        >
          <line
            x1="0"
            y1="2"
            x2="100"
            y2="2"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 5"
            vectorEffect="non-scaling-stroke"
            className="animate-route-sm motion-reduce:animate-none"
          />
        </svg>
        <span
          aria-hidden
          className={cn(
            'absolute bottom-1.5 left-0 h-1 origin-left animate-grow-x rounded-full motion-reduce:animate-none',
            rental ? 'bg-coral-300' : 'bg-mint-300',
          )}
          style={{ width: `${percent}%` }}
        />
        <span aria-hidden className="absolute bottom-1 -ml-[30px]" style={{ left: `${percent}%` }}>
          <Bus width={60} tone={rental ? 'coral' : 'teal'} />
        </span>
      </div>
      <span className="pb-1 text-right font-mono text-[13px] font-semibold tabular-nums">
        {splitGuatemala(trip.estimatedArrivalAt).time}
      </span>
    </li>
  );
}

export function OnTheRoad() {
  const trips = useTripsPage(ON_THE_ROAD, { refetchInterval: REFRESH_MS });
  const now = useNow(REFRESH_MS);

  return (
    <Panel
      title={
        <>
          <span
            aria-hidden
            className="size-2.5 animate-pulse-live rounded-full bg-mint-300 motion-reduce:animate-none"
          />
          En ruta ahora
        </>
      }
    >
      <PanelContent
        query={trips}
        errorMessage="No pudimos cargar los viajes en ruta."
        empty="Cuando un bus salga, lo verás aquí."
      >
        {({ items }) => (
          <ul className="flex flex-col gap-3.5">
            {items.map((trip) => (
              <Lane key={trip.id} trip={trip} now={now} />
            ))}
          </ul>
        )}
      </PanelContent>
    </Panel>
  );
}
