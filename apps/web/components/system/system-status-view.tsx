'use client';

import { PageHeader } from '@/components/layout/page-header';
import { ProbeCard } from '@/components/system/probe-card';
import { ServiceHealthCard } from '@/components/system/service-health-card';
import { useProbe } from '@/hooks/use-probe';
import { useSystemStatus } from '@/hooks/use-system-status';
import { ENVIRONMENT_LABELS, runtimeEnv } from '@/lib/env';

export function SystemStatusView() {
  const health = useSystemStatus();
  const probe = useProbe();

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Estado del sistema" />
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground">
          Revisa que cada parte de debus responda y reciba avisos.
        </p>
        <p className="text-sm text-muted-foreground">
          Entorno: {ENVIRONMENT_LABELS[runtimeEnv().appEnv]}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {health.isPending && (
          <div
            aria-label="Cargando servicios"
            className="flex flex-col gap-2 rounded-xl bg-sky-100 p-6"
          >
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-12 animate-shimmer rounded-lg bg-card motion-reduce:animate-none"
              />
            ))}
          </div>
        )}
        {health.isError && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-xl bg-rose-100 p-6 text-rose-700"
          >
            <p>{health.error.message}</p>
            <button
              type="button"
              onClick={() => void health.refetch()}
              className="h-11.5 rounded-lg px-4 font-medium transition hover:bg-rose-300/30 motion-reduce:transition-none"
            >
              Intentar de nuevo
            </button>
          </div>
        )}
        {health.data && <ServiceHealthCard units={health.data.units} />}
        <ProbeCard
          onSend={probe.send}
          isSending={probe.isSending}
          status={probe.status}
          elapsedMs={probe.elapsedMs}
          errorMessage={probe.error?.message}
        />
      </div>
    </>
  );
}
