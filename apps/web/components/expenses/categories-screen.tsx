'use client';

import { type ExpenseCategory, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Plus, Search } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ActiveToggleDialog } from '@/components/forms/active-toggle-dialog';
import { ConfirmDialog } from '@/components/forms/confirm-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useDeleteExpenseCategory,
  useExpenseCategoriesPage,
  useSaveExpenseCategory,
} from '@/hooks/use-expense-categories';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import {
  type CategoryListView,
  readCategoryListParams,
  writeCategoryListParams,
} from '@/lib/expenses/category-list-params';
import { CategoryDialog } from './category-dialog';
import { useCategoryColumns } from './category-columns';

// The global catalog of expense categories, which every branch picks from; only system admins edit it.
export function CategoriesScreen() {
  const [query, update] = useUrlQuery(readCategoryListParams, writeCategoryListParams);
  const categories = useExpenseCategoriesPage(query);
  const save = useSaveExpenseCategory();
  const remove = useDeleteExpenseCategory();
  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(categories.data, update);

  // `undefined` closes the dialog, `null` opens it to create, a category opens it to rename.
  const [editing, setEditing] = useState<ExpenseCategory | null | undefined>(undefined);
  const [toggling, setToggling] = useState<{ category: ExpenseCategory; active: boolean } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ExpenseCategory | null>(null);

  const columns = useCategoryColumns({
    onRename: useCallback((category: ExpenseCategory) => setEditing(category), []),
    onToggle: useCallback(
      (category: ExpenseCategory, active: boolean) => setToggling({ category, active }),
      [],
    ),
    onDelete: useCallback((category: ExpenseCategory) => setDeleting(category), []),
  });

  const narrowed = Boolean(query.q) || query.status !== 'active';

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Categorías de gasto"
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
            Nueva categoría
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de las categorías"
          value={query.status}
          onChange={(status: CategoryListView['status']) => update({ status })}
          options={[
            { value: 'active', label: 'Activas' },
            { value: 'inactive', label: 'Inactivas' },
          ]}
        />
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar categoría"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar por nombre"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Categorías de gasto"
        columns={columns}
        data={categories.data?.items ?? []}
        getRowId={(category) => category.id}
        isLoading={categories.isPending}
        isRefreshing={categories.isPlaceholderData}
        error={categories.isError ? 'No pudimos cargar las categorías.' : null}
        onRetry={() => void categories.refetch()}
        emptyMessage={
          narrowed
            ? 'No hay categorías con esos filtros.'
            : 'Aún no hay categorías. Crea la primera con «Nueva categoría».'
        }
        pagination={tablePagination(query, categories.data?.total, update)}
        minWidth={640}
      />

      <CategoryDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        category={editing ?? null}
      />

      <ActiveToggleDialog
        pending={toggling}
        onClose={() => setToggling(null)}
        subject={toggling?.category.name}
        reactivateDescription="Volverá a aparecer al registrar gastos de taller."
        deactivateDescription="Dejará de aparecer al registrar gastos nuevos. Los gastos que ya la usan se conservan."
        onConfirm={async () => {
          if (!toggling) return;
          const { category, active } = toggling;
          await save.mutateAsync({ id: category.id, request: { active } });
          toast.success(
            active
              ? `Reactivamos la categoría ${category.name}.`
              : `Desactivamos la categoría ${category.name}.`,
          );
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`¿Eliminar la categoría ${deleting?.name}?`}
        description="Saldrá del catálogo para siempre. Si ya tiene gastos, solo se puede desactivar."
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.success(`Eliminamos la categoría ${deleting.name}.`);
        }}
      />
    </>
  );
}
