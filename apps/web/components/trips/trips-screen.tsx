'use client';

import { SEARCH_MAX_LENGTH, todayInGuatemala } from '@debus/contracts';
import { Info, Plus, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { DateField } from '@/components/forms/date-field';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useRentalRequestsPage } from '@/hooks/use-rental-requests';
import { useTripsPage } from '@/hooks/use-trips';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { readTripListParams, writeTripListParams } from '@/lib/fleet/trip-list-params';
import { inputRules } from '@/lib/forms/input-rules';
import { RENTALS_TAB, TAB_PARAM, isRentalsTab } from '@/lib/trips/rental-list-params';
import { RentalRequestsTab } from './rental-requests-tab';
import { ScheduleTripDialog } from './schedule-trip-dialog';
import { tripColumns } from './trip-columns';

// Only the total matters here, to show how many rentals are waiting on the tab.
const WAITING_COUNT = { status: 'PENDING', page: 1, pageSize: 1 } as const;

type Tab = 'trips' | 'rentals';

// The list of trips, with the days, the state and the search the address carries.
function TripsList() {
  const [query, update] = useUrlQuery(readTripListParams, writeTripListParams);
  const trips = useTripsPage(query);
  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(trips.data, update);

  const today = todayInGuatemala();
  const narrowed =
    Boolean(query.q) || Boolean(query.to) || query.status !== 'all' || query.from !== today;

  return (
    <>
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
            rule={inputRules.text(SEARCH_MAX_LENGTH)}
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
    </>
  );
}

// The trips of the branch and, in another tab, the paid rentals that still need a bus and a driver.
export function TripsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const address = new URLSearchParams(useSearchParams().toString());
  const tab: Tab = isRentalsTab(address) ? 'rentals' : 'trips';
  const branch = useOwnBranch();
  const waiting = useRentalRequestsPage(WAITING_COUNT).data?.total;
  const [scheduling, setScheduling] = useState(false);

  const today = todayInGuatemala();
  const firstDay = readTripListParams(address).from;

  function showTab(next: Tab) {
    const href = next === 'rentals' ? `${pathname}?${TAB_PARAM}=${RENTALS_TAB}` : pathname;
    router.replace(href, { scroll: false });
  }

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

      <StatusTabs
        label="Qué ver"
        value={tab}
        onChange={showTab}
        options={[
          { value: 'trips', label: 'Viajes' },
          { value: 'rentals', label: 'Alquileres por asignar', count: waiting },
        ]}
      />

      {tab === 'rentals' ? <RentalRequestsTab /> : <TripsList />}

      <ScheduleTripDialog
        open={scheduling}
        onOpenChange={setScheduling}
        defaultDay={firstDay > today ? firstDay : today}
      />
    </>
  );
}
