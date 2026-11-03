'use client';

import type { Rental } from '@debus/contracts';
import { ArrowRight } from 'lucide-react';
import { StatusDot } from '@/components/brand/status-dot';
import { Moment } from '@/components/trips/trip-columns';
import { formatQuetzales } from '@/lib/format';
import { rentalPriceShown, rentalStatusView } from '@/lib/rentals/rental-status';

// The trip of a rental, with "En ventanilla" under the ones taken at the branch.
export function RentalTrip({ rental }: { rental: Rental }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-2 font-semibold">
        {rental.originLabel}
        <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-coral-700" />
        {rental.destinationLabel}
      </span>
      {rental.channel === 'COUNTER' && (
        <span className="text-[13px] text-muted-foreground">En ventanilla</span>
      )}
    </span>
  );
}

export function RentalDates({ rental }: { rental: Rental }) {
  return (
    <span className="flex flex-col gap-1">
      <Moment iso={rental.departureAt} />
      {rental.returnAt ? (
        <span className="text-[13px] text-muted-foreground">
          Regreso: <Moment iso={rental.returnAt} />
        </span>
      ) : (
        <span className="text-[13px] text-muted-foreground">Solo ida</span>
      )}
    </span>
  );
}

export function RentalPrice({ rental }: { rental: Rental }) {
  const { amount, estimated } = rentalPriceShown(rental);
  return (
    <span className="flex flex-col items-end">
      <span
        className={
          estimated
            ? 'font-mono text-muted-foreground tabular-nums'
            : 'font-mono font-semibold tabular-nums'
        }
      >
        {formatQuetzales(amount)}
      </span>
      {estimated && <span className="text-[13px] text-muted-foreground">estimado</span>}
    </span>
  );
}

export function RentalState({
  rental,
  audience,
}: {
  rental: Rental;
  audience: 'client' | 'branch';
}) {
  const view = rentalStatusView(rental.status);
  // An old counter rental without a client cannot be paid from an account.
  const atCounter = audience === 'client' && rental.status === 'CONFIRMED' && !rental.clientId;
  return (
    <StatusDot tone={view.tone} label={atCounter ? 'Se paga en ventanilla' : view[audience]} />
  );
}
