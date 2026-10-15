'use client';

import { type RepairExpense, SEARCH_MAX_LENGTH } from '@debus/contracts';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { DataTable, tablePagination } from '@/components/data/data-table';
import { KpiCard } from '@/components/data/kpi-card';
import { KpiSkeleton } from '@/components/data/kpi-skeleton';
import { DateField } from '@/components/forms/date-field';
import { PageHeader } from '@/components/layout/page-header';
import { OPTIONS_PAGE, useOptionSearch } from '@/components/forms/option-search';
import { OptionSelect } from '@/components/forms/option-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBusesPage } from '@/hooks/use-buses';
import { useExpenseCategoriesPage } from '@/hooks/use-expense-categories';
import { useOwnBranch } from '@/hooks/use-own-branch';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useRepairExpensesPage } from '@/hooks/use-repair-expenses';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { readExpenseListParams, writeExpenseListParams } from '@/lib/expenses/expense-list-params';
import { formatPlate, formatQuetzales } from '@/lib/format';
import { ExpenseDetailDialog } from './expense-detail-dialog';
import { useExpenseColumns } from './expense-columns';

const ALL_DATES = 'Todas las fechas';

// The repair expenses of the branch, filtered and paged on the server; the total covers the whole filter.
export function RepairExpensesScreen() {
  const [query, update] = useUrlQuery(readExpenseListParams, writeExpenseListParams);
  const expenses = useRepairExpensesPage(query);
  const branch = useOwnBranch();
  const [search, setSearch] = useUrlSearch(query.q, update);
  const [busSearch, setBusSearch, busTerm] = useOptionSearch();
  const [categorySearch, setCategorySearch, categoryTerm] = useOptionSearch();
  const buses = useBusesPage({
    status: 'all',
    ...(busTerm && { q: busTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const categories = useExpenseCategoriesPage({
    status: 'all',
    ...(categoryTerm && { q: categoryTerm }),
    ...OPTIONS_PAGE,
  }).data;
  const [opened, setOpened] = useState<RepairExpense | null>(null);
  usePageInRange(expenses.data, update);

  const columns = useExpenseColumns(
    useCallback((expense: RepairExpense) => setOpened(expense), []),
  );
  const narrowed = Boolean(query.q || query.busId || query.categoryId || query.from || query.to);

  return (
    <>
      <PageHeader
        eyebrow={branch ? `Finanzas · ${branch.name}` : 'Finanzas'}
        title="Gastos de taller"
        actions={
          <Button asChild>
            <Link href="/sucursal/gastos/nuevo">
              <Plus aria-hidden strokeWidth={1.75} className="size-4.5" />
              Registrar gasto
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OptionSelect
          id="expenses-bus"
          label="Bus"
          placeholder="Todos los buses"
          noneLabel="Todos los buses"
          options={(buses?.items ?? []).map((item) => ({
            value: item.id,
            label: formatPlate(item.plate),
          }))}
          total={buses?.total ?? 0}
          value={query.busId ?? ''}
          onChange={(busId) => update({ busId: busId || undefined })}
          search={busSearch}
          onSearchChange={setBusSearch}
          searchLabel="Buscar bus"
          emptyMessage="No hay buses registrados."
        />
        <OptionSelect
          id="expenses-category"
          label="Categoría"
          placeholder="Todas las categorías"
          noneLabel="Todas las categorías"
          options={(categories?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
          total={categories?.total ?? 0}
          value={query.categoryId ?? ''}
          onChange={(categoryId) => update({ categoryId: categoryId || undefined })}
          search={categorySearch}
          onSearchChange={setCategorySearch}
          searchLabel="Buscar categoría"
          emptyMessage="No hay categorías."
        />
        <DateField
          id="expenses-from"
          label="Desde"
          value={query.from ?? ''}
          max={query.to}
          hint={query.from ? 'Desde ese día' : ALL_DATES}
          onChange={(from) => update({ from: from || undefined })}
        />
        <DateField
          id="expenses-to"
          label="Hasta"
          value={query.to ?? ''}
          min={query.from}
          hint={query.to ? 'Hasta ese día' : ALL_DATES}
          onChange={(to) => update({ to: to || undefined })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar gasto"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Buscar placa, categoría o descripción"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
        <div className="w-full sm:w-64">
          {expenses.data ? (
            <KpiCard
              tone="coral"
              label="Total del filtro"
              value={expenses.data.summary.total}
              format={formatQuetzales}
            />
          ) : (
            !expenses.isError && <KpiSkeleton />
          )}
        </div>
      </div>

      <DataTable
        caption="Gastos de taller"
        columns={columns}
        data={expenses.data?.items ?? []}
        getRowId={(expense) => expense.id}
        isLoading={expenses.isPending}
        isRefreshing={expenses.isPlaceholderData}
        error={expenses.isError ? 'No pudimos cargar los gastos.' : null}
        onRetry={() => void expenses.refetch()}
        emptyMessage={
          narrowed ? 'No hay gastos con esos filtros.' : 'Aún no hay gastos de taller registrados.'
        }
        pagination={tablePagination(query, expenses.data?.total, update)}
        minWidth={860}
      />

      <ExpenseDetailDialog expense={opened} onOpenChange={(open) => !open && setOpened(null)} />
    </>
  );
}
