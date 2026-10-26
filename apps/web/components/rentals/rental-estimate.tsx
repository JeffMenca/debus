'use client';

import type { RentalEstimate as RentalEstimateData } from '@debus/contracts';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatQuetzales } from '@/lib/format';
import { parseDistance } from '@/lib/rentals/rental-form';
import { useRentalEstimate } from '@/lib/rentals/rentals-api';
import { cn } from '@/lib/utils';

function EstimateBody({ failed, estimate }: { failed: boolean; estimate?: RentalEstimateData }) {
  if (failed) {
    return (
      <span className="text-sm text-rose-700">
        No pudimos calcular el precio ahora. La sucursal te lo confirmará igual.
      </span>
    );
  }
  if (!estimate) {
    return (
      <span className="text-sm text-muted-foreground">
        Escribe la distancia para ver cuánto costaría.
      </span>
    );
  }
  return (
    <>
      <span className="font-mono text-[28px] leading-none font-bold tabular-nums">
        {formatQuetzales(estimate.estimatedPrice)}
      </span>
      <span className="text-[13px] text-muted-foreground">
        {formatQuetzales(estimate.ratePerKm)} por km. La sucursal lo confirma o lo ajusta.
      </span>
    </>
  );
}

// The price the distance would cost with the rate in force, while the person types it.
export function RentalEstimate({ distance, className }: { distance: string; className?: string }) {
  const km = useDebouncedValue(parseDistance(distance));
  const estimate = useRentalEstimate(km);

  return (
    <div
      aria-live="polite"
      className={cn('flex flex-col gap-1 rounded-2xl bg-card px-5 py-4', className)}
    >
      <span className="text-sm font-medium text-muted-foreground">Precio estimado</span>
      <EstimateBody
        failed={km !== null && estimate.isError}
        estimate={km === null ? undefined : estimate.data}
      />
    </div>
  );
}
