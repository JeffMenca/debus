'use client';

import { type Rental, estimateRentalPrice } from '@debus/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { messageOf } from '@/lib/api/client';
import { formatQuetzales } from '@/lib/format';
import { parseMoney } from '@/lib/number-input';
import { parseDistance } from '@/lib/rentals/rental-form';
import { useConfirmRental } from '@/lib/rentals/rentals-api';

function ConfirmRentalForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const confirm = useConfirmRental();
  const [distance, setDistance] = useState(String(rental.distanceKm));
  const [typedPrice, setTypedPrice] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const km = parseDistance(distance);
  // The rate of the request stays; only the kilometres can change the estimate.
  const estimate = km === null ? null : estimateRentalPrice(km, rental.ratePerKm);
  // The price follows the estimate until the admin writes another one.
  const price = typedPrice ?? (estimate === null ? '' : String(estimate));
  const amount = parseMoney(price);
  const distanceError =
    attempted && km === null ? 'Escribe los kilómetros, por ejemplo 92 o 92.5.' : undefined;
  const priceError = attempted && !amount ? 'Escribe un precio mayor a Q 0.' : undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (km === null || !amount) return;
    try {
      await confirm.mutateAsync({
        id: rental.id,
        request: { price: amount, ...(km !== rental.distanceKm && { distanceKm: km }) },
      });
    } catch {
      return;
    }
    toast.success(
      rental.channel === 'ONLINE'
        ? `Confirmamos el precio. Le avisamos a ${rental.clientName} por correo.`
        : 'Confirmamos el precio.',
    );
    onDone();
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <Field id="confirm-distance" label="Distancia (km)" error={distanceError}>
          <Input
            id="confirm-distance"
            inputMode="decimal"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
            className="font-mono tabular-nums"
            {...invalidProps('confirm-distance', distanceError)}
          />
        </Field>
        <Field id="confirm-price" label="Precio" error={priceError}>
          <Input
            id="confirm-price"
            inputMode="decimal"
            value={price}
            onChange={(event) => setTypedPrice(event.target.value)}
            className="font-mono tabular-nums"
            {...invalidProps('confirm-price', priceError)}
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        {estimate === null
          ? 'Escribe la distancia para ver el estimado.'
          : `Estimado con ${formatQuetzales(rental.ratePerKm)} por km: ${formatQuetzales(estimate)}.`}
      </p>
      {confirm.isError && <FormAlert tone="error">{messageOf(confirm.error)}</FormAlert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={confirm.isPending}>
          {confirm.isPending ? 'Confirmando...' : 'Confirmar precio'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

interface ConfirmRentalDialogProps {
  rental: Rental | null;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmRentalDialog({ rental, onOpenChange }: ConfirmRentalDialogProps) {
  return (
    <Dialog open={Boolean(rental)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {rental && (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar precio</DialogTitle>
              <DialogDescription>
                {rental.clientName} · {rental.originLabel} a {rental.destinationLabel} ·{' '}
                {rental.passengers} pasajeros. Revisa los kilómetros y deja el estimado o pon otro
                precio.
              </DialogDescription>
            </DialogHeader>
            <ConfirmRentalForm rental={rental} onDone={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
