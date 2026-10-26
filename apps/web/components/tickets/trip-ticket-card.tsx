import type { SeatMap } from '@debus/contracts';
import { formatLongDate, formatPlate } from '@/lib/format';
import { splitGuatemala } from '@/lib/trips/schedule';

// The trip whose seats are being sold, at the counter or online: hours big, places under them.
export function TripTicketCard({ trip }: { trip: SeatMap }) {
  const departure = splitGuatemala(trip.departureAt);
  const arrival = splitGuatemala(trip.estimatedArrivalAt);
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-primary p-6 text-primary-foreground">
      <span
        aria-hidden
        className="absolute -top-10 -right-10 size-36 rounded-full bg-mango-300 opacity-90"
      />
      <span className="relative text-[13px] font-semibold text-secondary">
        Viaje · {formatLongDate(departure.day)} · {formatPlate(trip.busPlate)}
      </span>
      <div className="relative flex items-center gap-3.5">
        <div className="flex flex-col">
          <span className="font-display text-[32px] leading-none font-bold">{departure.time}</span>
          <span className="mt-1 text-[13px] text-secondary">{trip.originLabel}</span>
        </div>
        <span aria-hidden className="h-0.5 flex-1 border-t-2 border-dashed border-mango-300" />
        <div className="flex flex-col items-end">
          <span className="font-display text-[32px] leading-none font-bold">{arrival.time}</span>
          <span className="mt-1 text-[13px] text-secondary">{trip.destinationLabel}</span>
        </div>
      </div>
    </div>
  );
}
