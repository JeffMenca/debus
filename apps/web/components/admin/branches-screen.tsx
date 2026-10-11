'use client';

import type { BranchWithAdmins } from '@debus/contracts';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ActiveToggleDialog } from '@/components/forms/active-toggle-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranches, useSetBranchActive } from '@/hooks/use-branches';
import { type BranchTab, countBranchesByTab, filterBranches } from '@/lib/admin/branch-filters';
import { useBranchColumns } from './branch-columns';

const EMPTY: BranchWithAdmins[] = [];

export function BranchesScreen() {
  const router = useRouter();
  const branches = useBranches({ includeInactive: true });
  const setActive = useSetBranchActive();
  const [tab, setTab] = useState<BranchTab>('active');
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState<{ branch: BranchWithAdmins; active: boolean } | null>(
    null,
  );

  const all = branches.data ?? EMPTY;
  const visible = useMemo(() => filterBranches(all, tab, search), [all, tab, search]);
  const counts = countBranchesByTab(all);

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
          value={tab}
          onChange={setTab}
          options={[
            { value: 'active', label: 'Activas', count: counts.active },
            { value: 'inactive', label: 'Inactivas', count: counts.inactive },
            { value: 'all', label: 'Todas', count: counts.all },
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar sucursal"
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
        data={visible}
        getRowId={(branch) => branch.id}
        isLoading={branches.isPending}
        error={branches.isError ? 'No pudimos cargar las sucursales.' : null}
        onRetry={() => void branches.refetch()}
        emptyMessage="Aún no hay sucursales. Crea la primera con «Nueva sucursal»."
        summary={`Mostrando ${visible.length} de ${all.length} sucursales`}
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
