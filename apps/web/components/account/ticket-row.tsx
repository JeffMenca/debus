import type { Ticket } from '@debus/contracts';
import { Ticket as TicketIcon } from 'lucide-react';
import { StatusDot } from '@/components/brand/status-dot';
import { formatDateTime, formatQuetzales } from '@/lib/format';
import { formatSeat } from '@/lib/tickets/counter-sale';
import { ticketCode } from '@/lib/tickets/purchase';
import { cn } from '@/lib/utils';

const CHANNEL = {
  ONLINE: { label: 'Compra en línea', tone: 'bg-sky-100 text-sky-700' },
  COUNTER: { label: 'Comprado en ventanilla', tone: 'bg-lilac-100 text-lilac-700' },
} as const;

export function TicketRow({ ticket }: { ticket: Ticket }) {
  const channel = CHANNEL[ticket.channel];
  return (
    <li className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[22px] bg-card px-5 py-4 sm:grid-cols-[42px_minmax(0,1fr)_minmax(0,180px)_auto]">
      <span
        aria-hidden
        className={cn('flex size-[42px] items-center justify-center rounded-[13px]', channel.tone)}
      >
        <TicketIcon strokeWidth={1.75} className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold break-words">
          {ticket.originLabel} a {ticket.destinationLabel}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {formatDateTime(ticket.departureAt)} · asientos {ticket.seats.map(formatSeat).join(', ')}
        </span>
      </div>
      <span className="col-start-2 row-start-2 text-[13px] text-muted-foreground sm:col-start-3 sm:row-start-1">
        {ticket.status === 'PENDING' ? (
          <StatusDot tone="mango" label="Pago en confirmación" />
        ) : (
          channel.label
        )}
      </span>
      <div className="row-span-2 flex flex-col items-end sm:row-span-1">
        <span className="font-mono font-semibold tabular-nums">
          {formatQuetzales(ticket.total)}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{ticketCode(ticket.id)}</span>
      </div>
    </li>
  );
}
