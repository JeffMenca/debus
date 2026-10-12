'use client';

import { type BranchListStatus, type BranchWithAdmins, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ActiveToggleDialog } from '@/components/forms/active-toggle-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranchesPage, useSetBranchActive } from '@/hooks/use-branches';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { readBranchListParams, writeBranchListParams } from '@/lib/admin/branch-list-params';
import { useBranchColumns } from './branch-columns';

export function BranchesScreen() {
  const router = useRouter();
  const [query, update] = useUrlQuery(readBranchListParams, writeBranchListParams);
  const branches = useBranchesPage(query);
  const setActive = useSetBranchActive();
  const [toggling, setToggling] = useState<{ branch: BranchWithAdmins; active: boolean } | null>(
    null,
  );

  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(branches.data, update);

  const counts = branches.data?.summary.statusCounts;
  const narrowed = Boolean(query.q) || query.status !== 'active';

  const columns = useBranchColumns({
    onEdit: useCallback(
      (branch: BranchWithAdmins) => router.push(`/admin/sucursales/${branch.id}`),
      [router],
    ),
    onToggle: useCallback(
      (branch: BranchWithAdmins, active: boolean) => setToggling({ branch, active }),
      [],
    ),
  });

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Sucursales"
        actions={
          <Button asChild>
            <Link href="/admin/sucursales/nueva">
              <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
              Nueva sucursal
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de las sucursales"
          value={query.status}
          onChange={(status: BranchListStatus) => update({ status })}
          options={[
            { value: 'active', label: 'Activas', count: counts?.active },
            { value: 'inactive', label: 'Inactivas', count: counts?.inactive },
            { value: 'all', label: 'Todas', count: counts && counts.active + counts.inactive },
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar sucursal"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar nombre, código o lugar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Sucursales"
        columns={columns}
        data={branches.data?.items ?? []}
        getRowId={(branch) => branch.id}
        isLoading={branches.isPending}
        isRefreshing={branches.isPlaceholderData}
        error={branches.isError ? 'No pudimos cargar las sucursales.' : null}
        onRetry={() => void branches.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay sucursales con esos filtros.'
            : 'Aún no hay sucursales. Crea la primera con «Nueva sucursal».'
        }
        pagination={tablePagination(query, branches.data?.total, update)}
        minWidth={900}
      />

      <ActiveToggleDialog
        pending={toggling}
        onClose={() => setToggling(null)}
        subject={toggling?.branch.name}
        reactivateDescription="Volverá a aparecer para crear personal, buses y rutas."
        deactivateDescription="Dejará de aparecer para crear personal, buses y rutas. Su historial se conserva."
        onConfirm={async () => {
          if (!toggling) return;
          await setActive.mutateAsync({ id: toggling.branch.id, active: toggling.active });
          toast.success(
            toggling.active
              ? `Reactivamos la sucursal ${toggling.branch.name}.`
              : `Desactivamos la sucursal ${toggling.branch.name}.`,
          );
        }}
      />
    </>
  );
}
