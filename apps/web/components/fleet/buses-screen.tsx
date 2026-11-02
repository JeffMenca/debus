'use client';

import {
  type Bus,
  type BusDisplayStatus,
  BUS_DISPLAY_STATUSES,
  SEARCH_MAX_LENGTH,
} from '@debus/contracts';
import { Info, Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Bus as BusIllustration } from '@/components/brand/bus';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { KpiCard } from '@/components/data/kpi-card';
import { StatusTabs } from '@/components/data/status-tabs';
import { ActiveToggleDialog } from '@/components/forms/active-toggle-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusCounts, useBusesPage, useSaveBus, useSetBusActive } from '@/hooks/use-buses';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { messageOf } from '@/lib/api/client';
import { busToFields } from '@/lib/fleet/bus-fields';
import { readBusListParams, writeBusListParams } from '@/lib/fleet/bus-list-params';
import { BUS_ART_TONES, BUS_STATUS_LABELS } from '@/lib/fleet/bus-status';
import { formatPlate } from '@/lib/format';
import { inputRules } from '@/lib/forms/input-rules';
import { useBusColumns } from './bus-columns';
import { BusSheet } from './bus-sheet';

const STATUS_PLURALS: Record<BusDisplayStatus, string> = {
  IN_TRANSIT: 'En camino',
  AVAILABLE: 'Disponibles',
  IN_WORKSHOP: 'En taller',
  INACTIVE: 'Inactivos',
};

export function BusesScreen() {
  const [query, update] = useUrlQuery(readBusListParams, writeBusListParams);
  const buses = useBusesPage(query);
  const fleetCounts = useBusCounts().data;
  const { mutateAsync: saveBus } = useSaveBus();
  const setActive = useSetBusActive();
  const branch = useOwnBranch();
  const [editing, setEditing] = useState<{ bus: Bus | null; open: boolean } | null>(null);
  // The record stays while the panel animates out, so only `open` is cleared on close.
  const [toggling, setToggling] = useState<{ bus: Bus; active: boolean } | null>(null);

  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(buses.data, update);

  // The tabs follow the search; the cards always count the whole fleet.
  const counts = buses.data?.summary.statusCounts;
  const total = counts && Object.values(counts).reduce((sum, count) => sum + count, 0);
  const narrowed = Boolean(query.q) || query.status !== 'all';

  const columns = useBusColumns({
    onEdit: useCallback((bus: Bus) => setEditing({ bus, open: true }), []),
    onToggle: useCallback((bus: Bus, active: boolean) => setToggling({ bus, active }), []),
    onWorkshop: useCallback(
      async (bus: Bus, inWorkshop: boolean) => {
        const plate = formatPlate(bus.plate);
        try {
          await saveBus({
            id: bus.id,
            fields: {
              ...busToFields(bus),
              operationalStatus: inWorkshop ? 'IN_WORKSHOP' : 'AVAILABLE',
            },
          });
          toast.success(
            inWorkshop ? `El bus ${plate} está en taller.` : `El bus ${plate} volvió a servicio.`,
          );
        } catch (error) {
          toast.error(messageOf(error));
        }
      },
      [saveBus],
    ),
  });

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Flota · ${branch.name}` : 'Flota'}
        title="Buses"
        actions={
          <Button onClick={() => setEditing({ bus: null, open: true })}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
            Registrar bus
          </Button>
        }
      />

      <section
        aria-label="Resumen de la flota"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3"
      >
        {BUS_DISPLAY_STATUSES.map((status) => (
          <KpiCard
            key={status}
            tone={BUS_STATUS_LABELS[status].tone}
            value={fleetCounts?.[status] ?? 0}
            label={STATUS_PLURALS[status]}
            art={
              <BusIllustration
                width={88}
                tone={BUS_ART_TONES[status]}
                moving={status === 'IN_TRANSIT'}
              />
            }
          />
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de los buses"
          value={query.status}
          onChange={(status: typeof query.status) => update({ status })}
          options={[
            { value: 'all', label: 'Todos', count: total },
            ...BUS_DISPLAY_STATUSES.map((status) => ({
              value: status,
              label: STATUS_PLURALS[status],
              count: counts?.[status],
            })),
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar bus"
            rule={inputRules.text(SEARCH_MAX_LENGTH)}
            placeholder="Buscar placa, marca o modelo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Buses"
        columns={columns}
        data={buses.data?.items ?? []}
        getRowId={(bus) => bus.id}
        isLoading={buses.isPending}
        isRefreshing={buses.isPlaceholderData}
        error={buses.isError ? 'No pudimos cargar los buses.' : null}
        onRetry={() => void buses.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay buses con esos filtros.'
            : 'Aún no hay buses. Registra el primero con «Registrar bus».'
        }
        pagination={tablePagination(query, buses.data?.total, update)}
        minWidth={960}
        footerNote={
          <span className="flex items-center gap-2">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Un bus solo se desactiva si no tiene viajes programados ni en camino.
          </span>
        }
      />

      <BusSheet
        open={editing?.open ?? false}
        bus={editing?.bus ?? null}
        onOpenChange={(open) => !open && setEditing((current) => current && { ...current, open })}
      />

      <ActiveToggleDialog
        pending={toggling}
        onClose={() => setToggling(null)}
        subject={toggling ? formatPlate(toggling.bus.plate) : undefined}
        reactivateDescription="Volverá a aparecer para programar viajes."
        deactivateDescription="Dejará de aparecer para programar viajes. Su historial se conserva."
        onConfirm={async () => {
          if (!toggling) return;
          const { bus, active } = toggling;
          await setActive.mutateAsync({ id: bus.id, active });
          toast.success(
            active
              ? `Reactivamos el bus ${formatPlate(bus.plate)}.`
              : `Desactivamos el bus ${formatPlate(bus.plate)}.`,
          );
        }}
      />
    </>
  );
}
