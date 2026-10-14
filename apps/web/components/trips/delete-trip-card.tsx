'use client';

import type { TripDetail } from '@debus/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useDeleteTrip } from '@/hooks/use-trip';

const NOT_AVAILABLE =
  'No disponible: el viaje ya salió. Solo se eliminan viajes que no han salido.';

// Only a trip that has not left can go away; the card says why when it cannot.
export function DeleteTripCard({ trip }: { trip: TripDetail }) {
  const router = useRouter();
  const remove = useDeleteTrip();
  const [confirming, setConfirming] = useState(false);
  const rental = trip.type === 'RENTAL';

  return (
    <section className="flex animate-arrive flex-wrap items-center justify-between gap-4 rounded-[26px] bg-card px-5 py-5 motion-reduce:animate-none sm:px-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="font-bold">Eliminar viaje</h2>
        <p className="text-sm text-muted-foreground">
          {trip.canDelete ? 'Solo se eliminan viajes que no han salido.' : NOT_AVAILABLE}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!trip.canDelete}
        onClick={() => setConfirming(true)}
        className="bg-rose-100 text-rose-700 hover:bg-rose-100/70"
      >
        Eliminar
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Eliminar este viaje?"
        description={
          rental
            ? 'El alquiler ya está pagado: volverá a la lista de alquileres por asignar para darle otro bus y otro chofer.'
            : 'Dejará de aparecer para la venta de boletos y se avisará a quienes ya compraron.'
        }
        confirmLabel="Eliminar viaje"
        tone="danger"
        checkLabel={
          rental
            ? 'Entiendo que el alquiler volverá a la lista de alquileres por asignar.'
            : 'Entiendo que se avisará a quienes compraron boletos.'
        }
        onConfirm={async () => {
          await remove.mutateAsync(trip.id);
          toast.success('Eliminamos el viaje.');
          router.push('/sucursal/viajes');
        }}
      />
    </section>
  );
}
