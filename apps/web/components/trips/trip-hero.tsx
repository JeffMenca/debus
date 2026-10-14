import type { TripDetail } from '@debus/contracts';
import { Bus } from '@/components/brand/bus';
import { formatKm, formatPlate } from '@/lib/format';
import { longDayHeading } from '@/lib/greeting';
import { splitGuatemala } from '@/lib/trips/schedule';

// How far along the road the bus is drawn: it moves as the trip moves from one record to the next.
const PROGRESS = { SCHEDULED: 0, IN_TRANSIT: 50, COMPLETED: 100 } as const;

function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-card px-3.5 py-2.5 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold">{children}</span>
    </div>
  );
}

function Hour({ iso, label, align }: { iso: string; label: string; align: 'left' | 'right' }) {
  return (
    <div className={`flex flex-col pb-1.5 ${align === 'right' ? 'items-end' : ''}`}>
      <span className="font-display text-[26px] leading-tight font-bold">
        {splitGuatemala(iso).time}
      </span>
      <span className="text-xs font-semibold text-sky-700">{label}</span>
    </div>
  );
}

export function TripHero({ trip }: { trip: TripDetail }) {
  const rental = trip.type === 'RENTAL';
  const percent = PROGRESS[trip.status];
  const day = longDayHeading(splitGuatemala(trip.departureAt).day).toLowerCase();
  const left = trip.departure
    ? { iso: trip.departure.departedAt, label: 'salida real' }
    : { iso: trip.departureAt, label: 'salida programada' };
  const right = trip.arrival
    ? { iso: trip.arrival.arrivedAt, label: 'llegada real' }
    : { iso: trip.estimatedArrivalAt, label: 'llegada estimada' };

  return (
    <section className="relative flex animate-arrive flex-col gap-5 overflow-hidden rounded-[30px] bg-sky-100 px-5 pt-6 sm:px-8 sm:pt-7 motion-reduce:animate-none">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-bold text-sky-700">
            {rental ? 'Alquiler' : 'Viaje regular'} · {day}
          </span>
          <h1 className="font-display text-[30px] leading-[1.05] font-bold text-balance sm:text-[40px]">
            {trip.originName} a {trip.destinationName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Chip label="Bus">
            <span className="font-mono">{formatPlate(trip.busPlate)}</span>
          </Chip>
          <Chip label="Chofer">{trip.driverName}</Chip>
          {trip.distanceKm !== null && (
            <Chip label="Distancia">
              <span className="font-mono">{formatKm(trip.distanceKm)}</span>
            </Chip>
          )}
        </div>
      </div>
      <div className="flex items-end gap-4 pb-4">
        <Hour iso={left.iso} label={left.label} align="left" />
        <div
          role="progressbar"
          aria-label="Avance del viaje"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="relative h-[90px] min-w-0 flex-1"
        >
          <div className="absolute right-0 bottom-1.5 left-0 h-7 rounded-[14px] bg-road" />
          <svg
            aria-hidden
            preserveAspectRatio="none"
            viewBox="0 0 100 4"
            className="absolute right-3 bottom-[18px] left-3 h-1 w-[calc(100%-24px)] text-mango-300"
          >
            <line
              x1="0"
              y1="2"
              x2="100"
              y2="2"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="8 9"
              vectorEffect="non-scaling-stroke"
              className="animate-route motion-reduce:animate-none"
            />
          </svg>
          <span
            aria-hidden
            className="absolute bottom-[22px] transition-[left,transform] duration-[2400ms] ease-[var(--ease-route)] motion-reduce:transition-none"
            style={{ left: `${percent}%`, transform: `translateX(-${percent}%)` }}
          >
            <Bus
              width={96}
              tone={rental ? 'coral' : 'indigo'}
              moving={trip.status === 'IN_TRANSIT'}
            />
          </span>
        </div>
        <Hour iso={right.iso} label={right.label} align="right" />
      </div>
    </section>
  );
}
