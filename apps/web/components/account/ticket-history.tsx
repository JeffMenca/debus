'use client';

import type { PageQuery } from '@debus/contracts';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { ErrorAlert } from '@/components/data/error-alert';
import { PageBar } from '@/components/tickets/page-bar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { messageOf } from '@/lib/api/client';
import { useMyTickets } from '@/lib/tickets/my-tickets-api';
import { cn } from '@/lib/utils';
import { NextTripCard } from './next-trip-card';
import { TicketRow } from './ticket-row';

interface TicketHistoryProps {
  query: PageQuery;
  onChange: (patch: Partial<PageQuery>) => void;
}

// The "Boletos" tab of the account: online purchases and the counter sales made with the NIT.
export function TicketHistory({ query, onChange }: TicketHistoryProps) {
  const tickets = useMyTickets(query);
  usePageInRange(tickets.data, onChange);
  const data = tickets.data;

  if (tickets.isError) {
    return <ErrorAlert message={messageOf(tickets.error)} onRetry={() => void tickets.refetch()} />;
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-[220px] rounded-[28px]" />
        {[0, 1].map((row) => (
          <Skeleton key={row} className="h-[76px] rounded-[22px]" />
        ))}
      </div>
    );
  }
  if (data.total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-10 text-center">
        <p className="text-muted-foreground">
          Todavía no tienes boletos. Cuando compres uno, o te vendan uno en ventanilla con tu NIT,
          aparecerá aquí.
        </p>
        <Button asChild variant="secondary">
          <Link href="/viajes">Buscar viajes</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {data.summary.next && <NextTripCard ticket={data.summary.next} />}
      <ul
        aria-label="Tus boletos"
        className={cn(
          'flex flex-col gap-3 transition-opacity',
          tickets.isPlaceholderData && 'opacity-60',
        )}
      >
        {data.items.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} />
        ))}
      </ul>
      <PageBar query={query} total={data.total} shown={data.items.length} onChange={onChange} />
      {/* A deleted trip takes its ticket with it; this says where to look for the money. */}
      <p className="flex items-start gap-2 px-2 text-[13px] text-muted-foreground">
        <Info aria-hidden strokeWidth={1.75} className="mt-px size-4 shrink-0" />
        <span>
          Si se cancela un viaje, su boleto sale de esta lista y, si lo pagaste con tu cartera, la
          devolución aparece en{' '}
          <Link
            href="/cuenta?pestana=movimientos"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Movimientos
          </Link>
          .
        </span>
      </p>
    </div>
  );
}
