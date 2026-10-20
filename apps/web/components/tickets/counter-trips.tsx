'use client';

import { SEARCH_MAX_LENGTH, todayInGuatemala } from '@debus/contracts';
import { Info, Search } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { DateField } from '@/components/forms/date-field';
import { Input } from '@/components/ui/input';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { useCounterTrips } from '@/lib/tickets/counter-api';
import { readCounterParams, writeCounterParams } from '@/lib/tickets/counter-list-params';
import { counterTripColumns } from './counter-trip-columns';

// Step one at the counter: the trips leaving from the branch, with the day and search in the address.
export function CounterTrips({ onChoose }: { onChoose: (tripId: string) => void }) {
  const [query, update] = useUrlQuery(readCounterParams, writeCounterParams);
  const trips = useCounterTrips(query);
  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(trips.data, update);
  const columns = useMemo(() => counterTripColumns(onChoose), [onChoose]);
  const today = todayInGuatemala();

  return (
    <section aria-labelledby="counter-trips-title" className="flex flex-col gap-4">
      <h2 id="counter-trips-title" className="font-display text-[22px] font-bold">
        Elige el viaje
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <DateField
            id="counter-from"
            label="Desde"
            value={query.from}
            hint="Hoy por defecto, siempre editable"
            onChange={(from) => update({ from: from || today })}
          />
        </div>
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar destino o placa"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar destino o placa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>
      <DataTable
        caption="Viajes a la venta"
        columns={columns}
        data={trips.data?.items ?? []}
        getRowId={(trip) => trip.tripId}
        isLoading={trips.isPending}
        isRefreshing={trips.isPlaceholderData}
        error={trips.isError ? 'No pudimos cargar los viajes.' : null}
        onRetry={() => void trips.refetch()}
        emptyMessage="No hay viajes a la venta desde tu sucursal a partir de ese día."
        pagination={tablePagination(query, trips.data?.total, update)}
        minWidth={760}
        footerNote={
          <span className="flex items-center gap-2">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Solo aparecen los viajes que salen de tu sucursal y aún no han salido.
          </span>
        }
      />
    </section>
  );
}
