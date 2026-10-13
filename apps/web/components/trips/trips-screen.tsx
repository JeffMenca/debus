'use client';

import { SEARCH_MAX_LENGTH, todayInGuatemala } from '@debus/contracts';
import { Info, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { DateField } from '@/components/forms/date-field';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useTripsPage } from '@/hooks/use-trips';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { readTripListParams, writeTripListParams } from '@/lib/fleet/trip-list-params';
import { ScheduleTripDialog } from './schedule-trip-dialog';
import { tripColumns } from './trip-columns';

export function TripsScreen() {
  const [query, update] = useUrlQuery(readTripListParams, writeTripListParams);
  const trips = useTripsPage(query);
  const branch = useOwnBranch();
  const [scheduling, setScheduling] = useState(false);
  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(trips.data, update);

  const today = todayInGuatemala();
  const narrowed =
    Boolean(query.q) || Boolean(query.to) || query.status !== 'all' || query.from !== today;

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Operación · ${branch.name}` : 'Operación'}
        title="Viajes"
        actions={
          <Button onClick={() => setScheduling(true)}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
            Programar viaje
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <DateField
            id="trips-from"
            label="Desde"
            value={query.from}
            max={query.to}
            hint="Hoy por defecto, siempre editable"
            onChange={(from) => update({ from: from || today })}
          />
        </div>
        <div className="w-full sm:w-48">
          <DateField
            id="trips-to"
            label="Hasta"
            value={query.to ?? ''}
            min={query.from}
            hint="Opcional"
            onChange={(to) => update({ to: to || undefined })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de los viajes"
          value={query.status}
          onChange={(status: typeof query.status) => update({ status })}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'SCHEDULED', label: 'Programados' },
            { value: 'IN_TRANSIT', label: 'En camino' },
            { value: 'COMPLETED', label: 'Completados' },
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar ruta, placa o chofer"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar ruta, placa o chofer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Viajes"
        columns={tripColumns}
        data={trips.data?.items ?? []}
        getRowId={(trip) => trip.id}
        isLoading={trips.isPending}
        isRefreshing={trips.isPlaceholderData}
        error={trips.isError ? 'No pudimos cargar los viajes.' : null}
        onRetry={() => void trips.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay viajes con esos filtros.'
            : 'No hay viajes programados desde hoy. Crea el primero con «Programar viaje».'
        }
        pagination={tablePagination(query, trips.data?.total, update)}
        minWidth={960}
        footerNote={
          <span className="flex items-center gap-2">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Los días y las horas son los de Guatemala.
          </span>
        }
      />

      <ScheduleTripDialog
        open={scheduling}
        onOpenChange={setScheduling}
        defaultDay={query.from > today ? query.from : today}
      />
    </>
  );
}
