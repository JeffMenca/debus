import type { Ticket } from '@debus/contracts';
import { CircleCheck, Mail } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatPlate, formatQuetzales } from '@/lib/format';
import { formatSeat } from '@/lib/tickets/counter-sale';
import { ticketCode } from '@/lib/tickets/purchase';

// What the client sees once the wallet paid: the ticket and where to find it again.
export function PurchaseReceipt({ ticket }: { ticket: Ticket }) {
  const rows: [string, string][] = [
    ['Viaje', `${ticket.originLabel} → ${ticket.destinationLabel}`],
    ['Salida', formatDateTime(ticket.departureAt)],
    ['Bus', formatPlate(ticket.busPlate)],
    ['Asientos', ticket.seats.map(formatSeat).join(', ')],
  ];
  return (
    <section
      aria-labelledby="purchase-receipt-title"
      className="mx-auto flex w-full max-w-lg animate-arrive flex-col gap-5 rounded-[26px] bg-card p-6 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mint-100 text-mint-700">
          <CircleCheck aria-hidden strokeWidth={1.75} className="size-6" />
        </span>
        <h1
          id="purchase-receipt-title"
          className="font-display text-[26px] leading-tight font-bold"
        >
          ¡Listo! Tu boleto está pagado
        </h1>
      </div>
      <dl className="flex flex-col gap-3 rounded-2xl bg-sky-100 p-4 text-sm text-sky-700">
        <div className="flex justify-between gap-4">
          <dt>Boleto</dt>
          <dd className="font-mono font-semibold">{ticketCode(ticket.id)}</dd>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt>{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-sky-300 pt-3 text-base">
          <dt className="font-semibold">Total pagado</dt>
          <dd className="font-mono font-semibold text-foreground tabular-nums">
            {formatQuetzales(ticket.total)}
          </dd>
        </div>
      </dl>
      <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
        <Mail aria-hidden strokeWidth={1.75} className="mt-px size-4 shrink-0" />
        Te enviamos los boletos por correo. También los ves en tu cuenta.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="sm:flex-1">
          <Link href="/cuenta">Ver mis boletos</Link>
        </Button>
        <Button asChild variant="ghost" className="sm:flex-1">
          <Link href="/viajes">Buscar otro viaje</Link>
        </Button>
      </div>
    </section>
  );
}
