'use client';

import { type Rental, todayInGuatemala } from '@debus/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { DateField } from '@/components/forms/date-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { messageOf } from '@/lib/api/client';
import { formatQuetzales } from '@/lib/format';
import { rentalPriceShown } from '@/lib/rentals/rental-status';
import { usePayRental } from '@/lib/rentals/rentals-api';

function CashPaymentForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const pay = usePayRental();
  const [paidOn, setPaidOn] = useState(todayInGuatemala);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await pay.mutateAsync({ id: rental.id, paidOn });
    } catch {
      return;
    }
    toast.success(`Registramos el pago de ${rental.clientName}. Ya puedes asignarle bus y chofer.`);
    onDone();
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-2xl bg-coral-100 px-5 py-4 text-coral-700">
        <span className="text-sm font-medium">Recibes en efectivo</span>
        <span className="font-mono text-[28px] leading-none font-bold tabular-nums">
          {formatQuetzales(rentalPriceShown(rental).amount)}
        </span>
      </div>
      <DateField id="cash-paid-on" label="Fecha de pago" value={paidOn} onChange={setPaidOn} />
      {pay.isError && <FormAlert tone="error">{messageOf(pay.error)}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pay.isPending}>
          {pay.isPending ? 'Guardando...' : 'Registrar pago'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

interface CashPaymentDialogProps {
  rental: Rental | null;
  onOpenChange: (open: boolean) => void;
}

export function CashPaymentDialog({ rental, onOpenChange }: CashPaymentDialogProps) {
  return (
    <Dialog open={Boolean(rental)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {rental && (
          <>
            <DialogHeader>
              <DialogTitle>Registrar pago en efectivo</DialogTitle>
              <DialogDescription>
                {rental.clientName} · {rental.originLabel} a {rental.destinationLabel}.
              </DialogDescription>
            </DialogHeader>
            <CashPaymentForm rental={rental} onDone={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
