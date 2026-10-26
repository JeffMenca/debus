'use client';

import { type Rental, todayInGuatemala } from '@debus/contracts';
import Link from 'next/link';
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
import { useWallet } from '@/lib/wallet/wallet-api';

function PayRentalForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const pay = usePayRental();
  const balance = useWallet().data?.balance;
  const [paidOn, setPaidOn] = useState(todayInGuatemala);
  const { amount } = rentalPriceShown(rental);
  const short = balance !== undefined && balance < amount;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await pay.mutateAsync({ id: rental.id, paidOn });
    } catch {
      return;
    }
    toast.success('Listo, tu alquiler está pagado. Te enviamos la confirmación por correo.');
    onDone();
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-2xl bg-coral-100 px-5 py-4 text-coral-700">
        <span className="text-sm font-medium">Total a pagar</span>
        <span className="font-mono text-[28px] leading-none font-bold tabular-nums">
          {formatQuetzales(amount)}
        </span>
        {balance !== undefined && (
          <span className="text-[13px]">Tu saldo: {formatQuetzales(balance)}</span>
        )}
      </div>
      <DateField id="rental-paid-on" label="Fecha de pago" value={paidOn} onChange={setPaidOn} />
      {short && (
        <FormAlert tone="error">
          Tu saldo no alcanza.{' '}
          <Link href="/cuenta" className="font-semibold underline underline-offset-4">
            Recarga tu cartera
          </Link>{' '}
          y vuelve a intentarlo.
        </FormAlert>
      )}
      {pay.isError && <FormAlert tone="error">{messageOf(pay.error)}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pay.isPending || short}>
          {pay.isPending ? 'Pagando...' : 'Pagar con mi cartera'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Ahora no
        </Button>
      </div>
    </form>
  );
}

interface PayRentalDialogProps {
  rental: Rental | null;
  onOpenChange: (open: boolean) => void;
}

export function PayRentalDialog({ rental, onOpenChange }: PayRentalDialogProps) {
  return (
    <Dialog open={Boolean(rental)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {rental && (
          <>
            <DialogHeader>
              <DialogTitle>Pagar tu alquiler</DialogTitle>
              <DialogDescription>
                {rental.originLabel} a {rental.destinationLabel} · {rental.passengers} pasajeros. Se
                descuenta de tu cartera digital.
              </DialogDescription>
            </DialogHeader>
            <PayRentalForm rental={rental} onDone={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
