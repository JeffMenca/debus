'use client';

import { type Driver, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Info, Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ActiveToggleDialog } from '@/components/forms/active-toggle-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDriversPage, useSetDriverActive } from '@/hooks/use-drivers';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { readDriverListParams, writeDriverListParams } from '@/lib/fleet/driver-list-params';
import { useDriverColumns } from './driver-columns';
import { DriverSheet } from './driver-sheet';

export function DriversScreen() {
  const [query, update] = useUrlQuery(readDriverListParams, writeDriverListParams);
  const drivers = useDriversPage(query);
  const setActive = useSetDriverActive();
  const branch = useOwnBranch();
  const [editing, setEditing] = useState<{ driver: Driver | null; open: boolean } | null>(null);
  // The record stays while the panel animates out, so only `open` is cleared on close.
  const [toggling, setToggling] = useState<{ driver: Driver; active: boolean } | null>(null);

  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(drivers.data, update);

  const counts = drivers.data?.summary.statusCounts;
  const narrowed = Boolean(query.q) || query.status !== 'active';

  const columns = useDriverColumns({
    onEdit: useCallback((driver: Driver) => setEditing({ driver, open: true }), []),
    onToggle: useCallback((driver: Driver, active: boolean) => setToggling({ driver, active }), []),
  });

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Flota · ${branch.name}` : 'Flota'}
        title="Choferes"
        actions={
          <Button onClick={() => setEditing({ driver: null, open: true })}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
            Registrar chofer
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de los choferes"
          value={query.status}
          onChange={(status: typeof query.status) => update({ status })}
          options={[
            { value: 'active', label: 'Activos', count: counts?.active },
            { value: 'inactive', label: 'Inactivos', count: counts?.inactive },
            { value: 'all', label: 'Todos', count: counts && counts.active + counts.inactive },
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar chofer"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar nombre, licencia o correo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Choferes"
        columns={columns}
        data={drivers.data?.items ?? []}
        getRowId={(driver) => driver.id}
        isLoading={drivers.isPending}
        isRefreshing={drivers.isPlaceholderData}
        error={drivers.isError ? 'No pudimos cargar los choferes.' : null}
        onRetry={() => void drivers.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay choferes con esos filtros.'
            : 'Aún no hay choferes. Registra el primero con «Registrar chofer».'
        }
        pagination={tablePagination(query, drivers.data?.total, update)}
        minWidth={1000}
        footerNote={
          <span className="flex items-center gap-2">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Un chofer solo se desactiva si no tiene viajes programados ni en camino.
          </span>
        }
      />

      <DriverSheet
        open={editing?.open ?? false}
        driver={editing?.driver ?? null}
        onOpenChange={(open) => !open && setEditing((current) => current && { ...current, open })}
      />

      <ActiveToggleDialog
        pending={toggling}
        onClose={() => setToggling(null)}
        subject={toggling ? `a ${toggling.driver.fullName}` : undefined}
        reactivateDescription="Volverá a poder recibir viajes y entrar a debus."
        deactivateDescription="No podrá recibir viajes ni entrar a debus. Su historial se conserva."
        onConfirm={async () => {
          if (!toggling) return;
          const { driver, active } = toggling;
          await setActive.mutateAsync({ id: driver.id, active });
          toast.success(
            active ? `Reactivamos a ${driver.fullName}.` : `Desactivamos a ${driver.fullName}.`,
          );
        }}
      />
    </>
  );
}
