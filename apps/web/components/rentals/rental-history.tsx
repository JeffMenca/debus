'use client';

import type { PageQuery, Rental } from '@debus/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, columnHelperFor, tablePagination } from '@/components/data/data-table';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { Button } from '@/components/ui/button';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useCancelRental, useMyRentals } from '@/lib/rentals/rentals-api';
import { PayRentalDialog } from './pay-rental-dialog';
import { RentalDates, RentalPrice, RentalState, RentalTrip } from './rental-columns';

const helper = columnHelperFor<Rental>();
const UNPAID = new Set<Rental['status']>(['REQUESTED', 'CONFIRMED']);

interface RentalHistoryProps {
  query: PageQuery;
  onChange: (patch: Partial<PageQuery>) => void;
}

// The rentals of the client: those asked for online and those taken at a counter with their NIT.
export function RentalHistory({ query, onChange }: RentalHistoryProps) {
  const rentals = useMyRentals(query);
  const cancel = useCancelRental();
  const [paying, setPaying] = useState<Rental | null>(null);
  const [cancelling, setCancelling] = useState<Rental | null>(null);
  usePageInRange(rentals.data, onChange);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('destinationLabel', {
          header: 'Viaje',
          cell: ({ row }) => <RentalTrip rental={row.original} />,
        }),
        helper.accessor('departureAt', {
          header: 'Salida',
          cell: ({ row }) => <RentalDates rental={row.original} />,
        }),
        helper.accessor('passengers', {
          header: () => <span className="block text-right">Pasajeros</span>,
          cell: (info) => <span className="block text-right font-mono">{info.getValue()}</span>,
        }),
        helper.accessor('price', {
          header: () => <span className="block text-right">Precio</span>,
          cell: ({ row }) => <RentalPrice rental={row.original} />,
        }),
        helper.accessor('status', {
          header: 'Estado',
          cell: ({ row }) => <RentalState rental={row.original} audience="client" />,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const rental = row.original;
            // An old counter rental without a client only appears here by its NIT.
            if (!rental.clientId || !UNPAID.has(rental.status)) return null;
            return (
              <div className="flex justify-end gap-2">
                {rental.status === 'CONFIRMED' && (
                  <Button variant="coral" onClick={() => setPaying(rental)}>
                    Pagar
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setCancelling(rental)}>
                  Cancelar
                </Button>
              </div>
            );
          },
        }),
      ]),
    [],
  );

  if (rentals.data?.total === 0 && !rentals.isPlaceholderData) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-10 text-center">
        <p className="text-muted-foreground">
          Todavía no has alquilado un bus. Si alquilaste uno en ventanilla con tu NIT, también
          aparecerá aquí.
        </p>
        <Button asChild variant="secondary">
          <Link href="/alquiler">Pide tu cotización</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <DataTable
        caption="Tus alquileres"
        columns={columns}
        data={rentals.data?.items ?? []}
        getRowId={(rental) => rental.id}
        isLoading={rentals.isPending}
        isRefreshing={rentals.isPlaceholderData}
        error={rentals.isError ? 'No pudimos cargar tus alquileres.' : null}
        onRetry={() => void rentals.refetch()}
        emptyMessage="Todavía no has alquilado un bus."
        pagination={tablePagination(query, rentals.data?.total, onChange)}
        minWidth={760}
        footerNote="Te avisamos por correo cuando la sucursal confirme el precio."
      />
      <PayRentalDialog rental={paying} onOpenChange={(open) => !open && setPaying(null)} />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="¿Cancelar este alquiler?"
        description="Todavía no lo has pagado, así que no se te cobra nada."
        confirmLabel="Sí, cancelar"
        tone="danger"
        onConfirm={async () => {
          if (!cancelling) return;
          await cancel.mutateAsync(cancelling.id);
          toast.success('Cancelamos tu alquiler.');
        }}
      />
    </>
  );
}
