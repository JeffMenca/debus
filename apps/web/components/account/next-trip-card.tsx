import type { Ticket } from '@debus/contracts';
import { ArrowRight } from 'lucide-react';
import { Bus } from '@/components/brand/bus';
import { StatusDot } from '@/components/brand/status-dot';
import { formatLongDate, formatPlate, formatQuetzales } from '@/lib/format';
import { formatSeat } from '@/lib/tickets/counter-sale';
import { ticketCode } from '@/lib/tickets/purchase';
import { splitGuatemala } from '@/lib/trips/schedule';

// The ticket of the trip that leaves soonest, on top of the history.
export function NextTripCard({ ticket }: { ticket: Ticket }) {
  const departure = splitGuatemala(ticket.departureAt);
  return (
    <section
      aria-labelledby="next-trip-title"
      className="grid animate-arrive gap-5 overflow-hidden rounded-[28px] bg-sky-100 p-6 text-sky-700 motion-reduce:animate-none sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <h2 id="next-trip-title" className="flex items-center gap-2 text-[13px] font-semibold">
          <span aria-hidden className="size-2 rounded-full bg-primary" />
          Próximo viaje · {formatLongDate(departure.day)}
        </h2>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1 text-foreground">
          <div className="flex flex-col">
            <span className="font-display text-[40px] leading-none font-bold tabular-nums">
              {departure.time}
            </span>
            <span className="mt-1 text-sm text-sky-700">{ticket.originLabel}</span>
          </div>
          <ArrowRight aria-hidden strokeWidth={1.75} className="mb-6 size-5 text-primary" />
          <span className="mb-0.5 font-display text-[22px] leading-tight font-bold">
            {ticket.destinationLabel}
          </span>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-foreground">
          <div className="flex gap-1.5">
            <dt>Asientos</dt>
            <dd className="font-mono">{ticket.seats.map(formatSeat).join(', ')}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Bus</dt>
            <dd className="font-mono">{formatPlate(ticket.busPlate)}</dd>
          </div>
        </dl>
        {ticket.status === 'PENDING' && (
          <StatusDot tone="mango" label="Pago en confirmación" live />
        )}
        <div aria-hidden className="hidden border-b-2 border-dashed border-sky-300 pb-1 sm:block">
          <Bus width={110} tone="indigo" />
        </div>
      </div>
      <div className="flex flex-row items-end justify-between gap-4 border-t-2 border-dashed border-sky-300 pt-4 sm:flex-col sm:items-start sm:border-t-0 sm:border-l-2 sm:pt-0 sm:pl-6">
        <span className="font-mono text-[13px]">{ticketCode(ticket.id)}</span>
        <span className="font-mono text-2xl font-semibold text-foreground tabular-nums">
          {formatQuetzales(ticket.total)}
        </span>
      </div>
    </section>
  );
}
