'use client';

import { CalendarClock } from 'lucide-react';
import { tablePagination } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useSettingsPage, useSettingsSummary } from '@/hooks/use-settings';
import { useUrlQuery } from '@/hooks/use-url-query';
import { readSettingsListParams, writeSettingsListParams } from '@/lib/admin/settings-list-params';
import { formatLongDate, formatQuetzales } from '@/lib/format';
import { SettingsForm } from './settings-form';
import { SettingsHistory } from './settings-history';

function CurrentCard({
  title,
  tone,
  amount,
  since,
}: {
  title: string;
  tone: string;
  amount: number | null;
  since: string | null;
}) {
  return (
    <section aria-label={title} className={`flex flex-col gap-1 rounded-[26px] p-6 ${tone}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="font-display text-[34px] leading-none font-bold tabular-nums">
        {amount === null ? 'Sin definir' : formatQuetzales(amount)}
      </p>
      {since && <p className="text-sm">Vigente desde el {formatLongDate(since)}</p>}
    </section>
  );
}

export function SettingsScreen() {
  const [query, update] = useUrlQuery(readSettingsListParams, writeSettingsListParams);
  const settings = useSettingsSummary();
  const history = useSettingsPage(query);
  usePageInRange(history.data, update);

  if (settings.isPending) {
    return (
      <>
        <PageHeader eyebrow="Administración" title="Configuración" />
        <div aria-label="Cargando" className="flex flex-col gap-4">
          <Skeleton className="h-32 rounded-[26px]" />
          <Skeleton className="h-64 rounded-[26px]" />
        </div>
      </>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <>
        <PageHeader eyebrow="Administración" title="Configuración" />
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[26px] bg-rose-100 p-6 text-rose-700"
        >
          <span>No pudimos cargar la configuración.</span>
          <Button variant="ghost" onClick={() => void settings.refetch()}>
            Reintentar
          </Button>
        </div>
      </>
    );
  }

  const { current, upcoming: next } = settings.data;

  return (
    <>
      <PageHeader eyebrow="Administración" title="Configuración" />

      <div className="grid gap-4 sm:grid-cols-2">
        <CurrentCard
          title="Depreciación por kilómetro"
          tone="bg-mango-100 text-mango-700"
          amount={current?.depreciationPerKm ?? null}
          since={current?.effectiveFrom ?? null}
        />
        <CurrentCard
          title="Tarifa de alquiler por kilómetro"
          tone="bg-coral-100 text-coral-700"
          amount={current?.rentalRatePerKm ?? null}
          since={current?.effectiveFrom ?? null}
        />
      </div>

      {!current && (
        <p className="text-[15px] text-muted-foreground">
          Define los montos para poder calcular los costos de los viajes.
        </p>
      )}

      {next && (
        <p className="flex items-start gap-3 rounded-2xl bg-sky-100 px-4 py-3.5 text-[15px] text-sky-700">
          <CalendarClock aria-hidden strokeWidth={1.75} className="mt-0.5 size-5 shrink-0" />
          <span>
            El {formatLongDate(next.effectiveFrom)} cambia a{' '}
            {formatQuetzales(next.depreciationPerKm)} por km de depreciación y{' '}
            {formatQuetzales(next.rentalRatePerKm)} por km de alquiler.
          </span>
        </p>
      )}

      <SettingsForm />
      <section aria-labelledby="settings-history" className="flex flex-col gap-3">
        <h2 id="settings-history" className="font-display text-xl font-bold">
          Historial
        </h2>
        <SettingsHistory
          versions={history.data?.items ?? []}
          current={current}
          isLoading={history.isPending}
          isRefreshing={history.isPlaceholderData}
          error={history.isError ? 'No pudimos cargar el historial.' : null}
          onRetry={() => void history.refetch()}
          pagination={tablePagination(query, history.data?.total, update)}
        />
      </section>
    </>
  );
}
