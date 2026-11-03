'use client';

import { type Rental, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Info, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, columnHelperFor, tablePagination } from '@/components/data/data-table';
import { RowActions } from '@/components/data/row-actions';
import { StatusTabs } from '@/components/data/status-tabs';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { DateField } from '@/components/forms/date-field';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { formatQuetzales } from '@/lib/format';
import { inputRules } from '@/lib/forms/input-rules';
import {
  type BranchRentalStatus,
  readBranchRentalParams,
  writeBranchRentalParams,
} from '@/lib/rentals/rental-list-params';
import { rentalPriceShown } from '@/lib/rentals/rental-status';
import { useBranchRentals, useCancelPaidRental, useCancelRental } from '@/lib/rentals/rentals-api';
import { CashPaymentDialog } from './cash-payment-dialog';
import { ConfirmRentalDialog } from './confirm-rental-dialog';
import { RentalDates, RentalPrice, RentalState, RentalTrip } from './rental-columns';

const helper = columnHelperFor<Rental>();

const TABS: { value: BranchRentalStatus; label: string }[] = [
  { value: 'REQUESTED', label: 'Por confirmar' },
  { value: 'CONFIRMED', label: 'Esperando pago' },
  { value: 'PAID', label: 'Pagados' },
  { value: 'CANCELLED', label: 'Cancelados' },
  { value: 'all', label: 'Todos' },
];

const EMPTY: Record<BranchRentalStatus, string> = {
  REQUESTED: 'No hay alquileres esperando precio.',
  CONFIRMED: 'No hay alquileres esperando pago.',
  PAID: 'No hay alquileres pagados.',
  CANCELLED: 'No hay alquileres cancelados.',
  all: 'Todavía no hay alquileres en tu sucursal.',
};

// What the cancellation means for the money, said before the admin confirms it.
function cancellationText(rental: Rental): string {
  if (rental.status !== 'PAID') return 'Todavía no está pagado, así que no hay nada que devolver.';
  const amount = formatQuetzales(rentalPriceShown(rental).amount);
  const refund = rental.clientId
    ? `Devolveremos ${amount} a la cartera del cliente.`
    : `Devuelve ${amount} en efectivo en la ventanilla.`;
  return `${refund} Si ya tiene bus asignado, ese viaje también se elimina.`;
}

export function BranchRentalsScreen() {
  const [query, update] = useUrlQuery(readBranchRentalParams, writeBranchRentalParams);
  const rentals = useBranchRentals(query);
  const branch = useOwnBranch();
  const [search, setSearch] = useUrlSearch(query.q, update);
  const [confirming, setConfirming] = useState<Rental | null>(null);
  const [collecting, setCollecting] = useState<Rental | null>(null);
  const [cancelling, setCancelling] = useState<Rental | null>(null);
  const cancelUnpaid = useCancelRental();
  const cancelPaid = useCancelPaidRental();
  usePageInRange(rentals.data, update);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('clientName', {
          header: 'Cliente',
          cell: ({ row }) => (
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">{row.original.clientName}</span>
              <span className="font-mono text-[13px] text-muted-foreground">
                {row.original.nit}
              </span>
            </span>
          ),
        }),
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
        helper.accessor('distanceKm', {
          header: () => <span className="block text-right">Km</span>,
          cell: (info) => <span className="block text-right font-mono">{info.getValue()}</span>,
        }),
        helper.accessor('price', {
          header: () => <span className="block text-right">Precio</span>,
          cell: ({ row }) => <RentalPrice rental={row.original} />,
        }),
        helper.accessor('status', {
          header: 'Estado',
          cell: ({ row }) => <RentalState rental={row.original} audience="branch" />,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const rental = row.original;
            if (rental.status === 'CANCELLED') return null;
            return (
              <div className="flex justify-end">
                <RowActions
                  label={rental.clientName}
                  actions={[
                    {
                      label: 'Confirmar precio',
                      onSelect: () => setConfirming(rental),
                      hidden: rental.status !== 'REQUESTED',
                    },
                    {
                      label: 'Registrar pago en efectivo',
                      onSelect: () => setCollecting(rental),
                      hidden: rental.status !== 'CONFIRMED' || Boolean(rental.clientId),
                    },
                    {
                      label: 'Cancelar alquiler',
                      onSelect: () => setCancelling(rental),
                      tone: 'danger',
                    },
                  ]}
                />
              </div>
            );
          },
        }),
      ]),
    [],
  );

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Operación · ${branch.name}` : 'Operación'}
        title="Alquileres"
        actions={
          <Button asChild>
            <Link href="/sucursal/alquileres/ventanilla">
              <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
              Registrar alquiler de ventanilla
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <DateField
            id="rentals-from"
            label="Salida desde"
            value={query.from ?? ''}
            max={query.to}
            hint="Opcional"
            onChange={(from) => update({ from: from || undefined })}
          />
        </div>
        <div className="w-full sm:w-48">
          <DateField
            id="rentals-to"
            label="Salida hasta"
            value={query.to ?? ''}
            min={query.from}
            hint="Opcional"
            onChange={(to) => update({ to: to || undefined })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de los alquileres"
          value={query.status}
          onChange={(status: BranchRentalStatus) => update({ status })}
          options={TABS}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar alquiler"
            rule={inputRules.text(SEARCH_MAX_LENGTH)}
            placeholder="Buscar cliente, NIT o destino"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Alquileres"
        columns={columns}
        data={rentals.data?.items ?? []}
        getRowId={(rental) => rental.id}
        isLoading={rentals.isPending}
        isRefreshing={rentals.isPlaceholderData}
        error={rentals.isError ? 'No pudimos cargar los alquileres.' : null}
        onRetry={() => void rentals.refetch()}
        emptyMessage={query.q ? 'No hay alquileres con esa búsqueda.' : EMPTY[query.status]}
        pagination={tablePagination(query, rentals.data?.total, update)}
        minWidth={1040}
        footerNote={
          <span className="flex items-center gap-2">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Los alquileres pagados se asignan en Viajes, pestaña «Alquileres por asignar».
          </span>
        }
      />

      <ConfirmRentalDialog
        rental={confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      />
      <CashPaymentDialog
        rental={collecting}
        onOpenChange={(open) => !open && setCollecting(null)}
      />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={cancelling ? `¿Cancelar el alquiler de ${cancelling.clientName}?` : ''}
        description={cancelling ? cancellationText(cancelling) : ''}
        confirmLabel="Sí, cancelar alquiler"
        tone="danger"
        checkLabel="Entiendo que esto no se puede deshacer"
        onConfirm={async () => {
          if (!cancelling) return;
          if (cancelling.status !== 'PAID') {
            await cancelUnpaid.mutateAsync(cancelling.id);
            toast.success('Cancelamos el alquiler.');
            return;
          }
          await cancelPaid.mutateAsync(cancelling.id);
          toast.success(
            cancelling.clientId
              ? 'Cancelamos el alquiler. La devolución llega a la cartera del cliente en unos segundos.'
              : 'Cancelamos el alquiler. Devuelve el efectivo en la ventanilla.',
          );
        }}
      />
    </>
  );
}
