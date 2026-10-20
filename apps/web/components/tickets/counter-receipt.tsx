import type { Ticket } from '@debus/contracts';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLongDate, formatQuetzales } from '@/lib/format';
import { formatSeat } from '@/lib/tickets/counter-sale';

// What the counter tells the buyer once the cash is in: everything printed on a ticket.
export function CounterReceipt({ ticket, onNext }: { ticket: Ticket; onNext: () => void }) {
  const rows: [string, string][] = [
    ['Viaje', `${ticket.originLabel} → ${ticket.destinationLabel}`],
    ['Asientos', ticket.seats.map(formatSeat).join(', ')],
    ['Comprador', ticket.buyerName],
    ['NIT', ticket.nit],
    ['Fecha de pago', formatLongDate(ticket.paidOn)],
  ];
  return (
    <section
      aria-labelledby="counter-receipt-title"
      className="mx-auto flex w-full max-w-lg animate-arrive flex-col gap-5 rounded-[26px] bg-card p-6 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-mint-100 text-mint-700">
          <CircleCheck aria-hidden strokeWidth={1.75} className="size-6" />
        </span>
        <h2 id="counter-receipt-title" className="font-display text-[22px] font-bold">
          Boleto vendido
        </h2>
      </div>
      <dl className="flex flex-col gap-3 rounded-2xl bg-muted p-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-muted-2 pt-3 text-base">
          <dt className="font-semibold">Total cobrado</dt>
          <dd className="font-mono font-semibold tabular-nums">{formatQuetzales(ticket.total)}</dd>
        </div>
      </dl>
      <Button onClick={onNext}>Vender otro boleto</Button>
    </section>
  );
}
