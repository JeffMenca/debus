import type { AvailableTrip } from '@debus/contracts';
import { ArrowRight, type LucideIcon, Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatPlate, formatQuetzales } from '@/lib/format';
import {
  type PartOfDay,
  type SeatsTone,
  partOfDay,
  seatsLeft,
  tripDuration,
} from '@/lib/tickets/purchase';
import { splitGuatemala } from '@/lib/trips/schedule';
import { cn } from '@/lib/utils';

const PART_OF_DAY: Record<PartOfDay, { icon: LucideIcon; tone: string }> = {
  Madrugada: { icon: Sunrise, tone: 'bg-mango-100 text-mango-700' },
  Mañana: { icon: Sun, tone: 'bg-sky-100 text-sky-700' },
  Mediodía: { icon: Sun, tone: 'bg-mint-100 text-mint-700' },
  Tarde: { icon: Sunset, tone: 'bg-coral-100 text-coral-700' },
  Noche: { icon: Moon, tone: 'bg-lilac-100 text-lilac-700' },
};

const SEATS_TONE: Record<SeatsTone, { text: string; bar: string }> = {
  plenty: { text: 'text-mint-700', bar: 'bg-mint-300' },
  few: { text: 'text-coral-700', bar: 'bg-coral-300' },
  none: { text: 'text-muted-foreground', bar: 'bg-muted-2' },
};

interface TripResultCardProps {
  trip: AvailableTrip;
  // The search of the list, carried to the seats so "Volver a viajes" lands on the same results.
  search: string;
}

export function TripResultCard({ trip, search }: TripResultCardProps) {
  const departure = splitGuatemala(trip.departureAt).time;
  const arrival = splitGuatemala(trip.estimatedArrivalAt).time;
  const part = partOfDay(departure);
  const { icon: PartIcon, tone } = PART_OF_DAY[part];
  const seats = seatsLeft(trip.freeSeats, trip.capacity);
  const seatsTone = SEATS_TONE[seats.tone];
  const href = `/viajes/${trip.tripId}/asientos${search ? `?${search}` : ''}`;

  return (
    <li className="grid animate-arrive grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-4 rounded-[26px] bg-card p-3.5 pr-5 transition hover:-translate-y-1 hover:shadow-lift motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:grid-cols-[112px_minmax(0,1fr)] lg:grid-cols-[112px_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto_auto] lg:gap-x-6">
      <div
        className={cn(
          'row-span-2 flex flex-col items-center justify-center gap-1 self-start rounded-[18px] py-3 lg:row-span-1 lg:self-stretch',
          tone,
        )}
      >
        <PartIcon aria-hidden strokeWidth={1.75} className="size-4.5" />
        <span className="font-display text-[26px] leading-none font-bold tabular-nums sm:text-[28px]">
          {departure}
        </span>
        <span className="text-xs font-semibold">{part}</span>
      </div>

      {/* Long place names wrap on their own line, so the route never squeezes them. */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-semibold break-words">
          {trip.originLabel} a {trip.destinationLabel}
        </span>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
          <span>{departure}</span>
          <span aria-hidden className="flex flex-1 items-center">
            <span className="size-2 rounded-full bg-primary" />
            <span className="flex-1 border-t-2 border-dashed border-primary/60" />
            <span className="size-2 rounded-full border-2 border-primary" />
          </span>
          <span>{arrival}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {tripDuration(trip.departureAt, trip.estimatedArrivalAt)} · directo
        </span>
      </div>

      <div className="col-start-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 lg:contents">
        <span className="font-mono text-[13px] text-muted-foreground">
          {formatPlate(trip.busPlate)}
        </span>

        <div className="flex min-w-[140px] flex-col gap-1.5">
          <span className={cn('text-[13px] font-semibold', seatsTone.text)}>{seats.label}</span>
          <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'block h-full origin-left animate-grow-x rounded-full motion-reduce:animate-none',
                seatsTone.bar,
              )}
              style={{ width: `${Math.round(seats.taken * 100)}%` }}
            />
          </span>
        </div>

        <div className="flex flex-col items-end">
          <span className="font-mono text-xl font-semibold tabular-nums">
            {formatQuetzales(trip.ticketPrice)}
          </span>
          <span className="text-xs text-muted-foreground">por asiento</span>
        </div>

        {trip.freeSeats > 0 ? (
          <Button asChild>
            <Link
              href={href}
              aria-label={`Elegir asientos de ${trip.originLabel} a ${trip.destinationLabel}, ${departure}`}
            >
              Elegir asientos
              <ArrowRight
                aria-hidden
                strokeWidth={1.75}
                className="size-4.5 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </Link>
          </Button>
        ) : (
          <Button variant="secondary" disabled>
            Agotado
          </Button>
        )}
      </div>
    </li>
  );
}
