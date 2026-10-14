'use client';

import { type RentalToAssign, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { Input } from '@/components/ui/input';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useRentalRequestsPage } from '@/hooks/use-rental-requests';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { readRentalListParams, writeRentalListParams } from '@/lib/trips/rental-list-params';
import { AssignRentalDialog } from './assign-rental-dialog';
import { useRentalColumns } from './rental-columns';

// The rentals already paid that wait for a bus and a driver; assigning one creates its trip.
export function RentalRequestsTab() {
  const [query, update] = useUrlQuery(readRentalListParams, writeRentalListParams);
  const rentals = useRentalRequestsPage(query);
  const [assigning, setAssigning] = useState<RentalToAssign | null>(null);
  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(rentals.data, update);

  const columns = useRentalColumns(
    useCallback((rental: RentalToAssign) => setAssigning(rental), []),
  );

  return (
    <>
      <div className="w-full sm:max-w-[320px]">
        <Input
          icon={Search}
          aria-label="Buscar alquiler"
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Buscar cliente, NIT o destino"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="bg-card"
        />
      </div>
      <DataTable
        caption="Alquileres por asignar"
        columns={columns}
        data={rentals.data?.items ?? []}
        getRowId={(rental) => rental.id}
        isLoading={rentals.isPending}
        isRefreshing={rentals.isPlaceholderData}
        error={rentals.isError ? 'No pudimos cargar los alquileres.' : null}
        onRetry={() => void rentals.refetch()}
        emptyMessage={
          query.q
            ? 'No hay alquileres con esa búsqueda.'
            : 'No hay alquileres esperando bus y chofer.'
        }
        pagination={tablePagination(query, rentals.data?.total, update)}
        minWidth={860}
      />
      <AssignRentalDialog
        request={assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
      />
    </>
  );
}
