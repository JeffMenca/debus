'use client';

import { type Route, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Info, Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useDeleteRoute, useRoutesPage, useSaveRoute } from '@/hooks/use-routes';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { messageOf } from '@/lib/api/client';
import { readRouteListParams, writeRouteListParams } from '@/lib/fleet/route-list-params';
import { RouteDialog } from './route-dialog';
import { useRouteColumns } from './route-columns';

export function RoutesScreen() {
  const [query, update] = useUrlQuery(readRouteListParams, writeRouteListParams);
  const routes = useRoutesPage(query);
  const { mutateAsync: saveRoute } = useSaveRoute();
  const remove = useDeleteRoute();
  const branch = useOwnBranch();
  const [editing, setEditing] = useState<{ route: Route | null; open: boolean } | null>(null);
  // The record stays while the panel animates out, so only `open` is cleared on close.
  const [deleting, setDeleting] = useState<{ route: Route; open: boolean } | null>(null);

  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(routes.data, update);

  const counts = routes.data?.summary.statusCounts;
  const narrowed = Boolean(query.q) || query.status !== 'active';

  const columns = useRouteColumns({
    onEdit: useCallback((route: Route) => setEditing({ route, open: true }), []),
    onDelete: useCallback((route: Route) => setDeleting({ route, open: true }), []),
    onToggle: useCallback(
      async (route: Route, active: boolean) => {
        try {
          await saveRoute({
            id: route.id,
            input: { distanceKm: route.distanceKm, ticketPrice: route.ticketPrice, active },
          });
          toast.success(
            active
              ? `Reactivamos la ruta a ${route.destinationName}.`
              : `Retiramos la ruta a ${route.destinationName}.`,
          );
        } catch (error) {
          toast.error(messageOf(error));
        }
      },
      [saveRoute],
    ),
  });

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Flota · ${branch.name}` : 'Flota'}
        title="Rutas"
        actions={
          <Button onClick={() => setEditing({ route: null, open: true })}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
            Nueva ruta
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de las rutas"
          value={query.status}
          onChange={(status: typeof query.status) => update({ status })}
          options={[
            { value: 'active', label: 'Activas', count: counts?.active },
            { value: 'inactive', label: 'Retiradas', count: counts?.inactive },
            { value: 'all', label: 'Todas', count: counts && counts.active + counts.inactive },
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar destino"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar destino"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Rutas"
        columns={columns}
        data={routes.data?.items ?? []}
        getRowId={(route) => route.id}
        isLoading={routes.isPending}
        isRefreshing={routes.isPlaceholderData}
        error={routes.isError ? 'No pudimos cargar las rutas.' : null}
        onRetry={() => void routes.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay rutas con esos filtros.'
            : 'Aún no hay rutas. Crea la primera con «Nueva ruta».'
        }
        pagination={tablePagination(query, routes.data?.total, update)}
        minWidth={760}
        footerNote={
          <span className="flex items-center gap-2">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Una ruta con viajes no se elimina: se retira para que no se programen más.
          </span>
        }
      />

      <RouteDialog
        open={editing?.open ?? false}
        route={editing?.route ?? null}
        onOpenChange={(open) => !open && setEditing((current) => current && { ...current, open })}
      />

      <ConfirmDialog
        open={deleting?.open ?? false}
        onOpenChange={(open) => !open && setDeleting((current) => current && { ...current, open })}
        title={`¿Eliminar la ruta a ${deleting?.route.destinationName}?`}
        description="No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.route.id);
          toast.success(`Eliminamos la ruta a ${deleting.route.destinationName}.`);
        }}
      />
    </>
  );
}
