'use client';

import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useTripsPage } from '@/hooks/use-trips';
import { useUrlQuery } from '@/hooks/use-url-query';
import { readDriverTripParams, writeDriverTripParams } from '@/lib/trips/driver-trip-params';
import { driverTripColumns } from './trip-columns';
import { OnTheRoadBanner } from './on-the-road-banner';

const EMPTY = {
  SCHEDULED: 'No tienes viajes próximos.',
  IN_TRANSIT: 'No tienes viajes en ruta.',
  COMPLETED: 'Aún no tienes viajes completados.',
} as const;

// The trips of the driver who signed in: the server returns only theirs.
export function DriverTripsScreen() {
  const [query, update] = useUrlQuery(readDriverTripParams, writeDriverTripParams);
  const trips = useTripsPage(query);
  const branch = useOwnBranch();
  usePageInRange(trips.data, update);

  return (
    <>
      <PageHeader eyebrow={branch ? `Chofer · ${branch.name}` : 'Chofer'} title="Mis viajes" />
      <OnTheRoadBanner />
      <StatusTabs
        label="Estado de tus viajes"
        value={query.status}
        onChange={(status: typeof query.status) => update({ status })}
        options={[
          { value: 'IN_TRANSIT', label: 'En ruta' },
          { value: 'SCHEDULED', label: 'Próximos' },
          { value: 'COMPLETED', label: 'Completados' },
        ]}
      />
      <DataTable
        caption="Mis viajes"
        columns={driverTripColumns}
        data={trips.data?.items ?? []}
        getRowId={(trip) => trip.id}
        isLoading={trips.isPending}
        isRefreshing={trips.isPlaceholderData}
        error={trips.isError ? 'No pudimos cargar tus viajes.' : null}
        onRetry={() => void trips.refetch()}
        emptyMessage={EMPTY[query.status]}
        pagination={tablePagination(query, trips.data?.total, update)}
        minWidth={720}
      />
    </>
  );
}
