'use client';

import {
  ARCHITECTURE_UNITS,
  type ArchitectureRow,
  type ArchitectureUnit,
  EVENT_TYPES,
  type EventType,
  architecturePageSchema,
  architectureTotals,
  eventFlows,
  filterFlows,
  syncCallsFor,
} from '@debus/contracts';
import { useMemo } from 'react';
import { DataTable, columnHelperFor, tablePagination } from '@/components/data/data-table';
import { OptionSelect } from '@/components/forms/option-select';
import { ReportFilters } from '@/components/reports/report-filters';
import { type Highlight, ReportHighlights } from '@/components/reports/report-highlights';
import { useSystemReport } from '@/hooks/use-system-report';
import { useSystemStatus } from '@/hooks/use-system-status';
import { formatCount, formatPercent } from '@/lib/format';
import { ARCHITECTURE_REPORT_PARAMS } from '@/lib/system-reports/architecture';
import { UNIT_LABELS } from '@/lib/system-view';
import { ArchitectureDiagram } from './architecture-diagram';
import { SystemReportHeader } from './system-report-header';

export const ARCHITECTURE_REPORT_PATH = '/api/reportes/reports/system-architecture';

// The diagram draws every filtered event at once from the registry of the contracts; the table pages
// on the server, which also writes what each event causes.
const FLOWS = eventFlows();
const TOTALS = architectureTotals();
const HIGHLIGHTS: Highlight[] = [
  { label: 'Eventos de negocio', value: TOTALS.events, tone: 'indigo', format: formatCount },
  { label: 'Llamadas directas', value: TOTALS.syncCalls, tone: 'coral', format: formatCount },
  {
    label: 'Comunicación por eventos',
    value: TOTALS.eventShare * 100,
    tone: 'mint',
    format: formatPercent,
    hint: 'El mínimo pedido es 50 %',
  },
];
const noSearch = () => undefined;

const helper = columnHelperFor<ArchitectureRow>();
const columns = helper.columns([
  helper.accessor('type', {
    header: 'Evento',
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span className="font-mono font-semibold">{row.original.type}</span>
        {row.original.diagnostic && <span className="text-muted-foreground">Diagnóstico</span>}
      </span>
    ),
  }),
  helper.accessor('publisher', {
    header: 'Lo publica',
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{UNIT_LABELS[row.original.publisher]}</span>
        <span className="font-mono whitespace-nowrap text-muted-foreground">
          {row.original.topic}
        </span>
      </span>
    ),
  }),
  helper.display({
    id: 'consumers',
    header: 'Lo reciben (suscripción)',
    cell: ({ row }) => (
      <ul className="flex flex-col gap-0.5">
        {row.original.consumers.map(({ service, subscription }) => (
          <li key={service} className="font-mono whitespace-nowrap">
            {subscription}
          </li>
        ))}
      </ul>
    ),
  }),
  helper.accessor('effect', { header: 'Qué provoca' }),
]);

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-6 rounded bg-indigo-500" />
        Publica el evento en su tópico
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-6 rounded bg-mint-500" />
        Pub/Sub se lo entrega a quien lo necesita
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-6 rounded bg-coral-700" />
        Llamada directa (se pausa si el otro servicio no responde)
      </li>
    </ul>
  );
}

// How the services talk to each other, with the live state of each service and of its direct calls.
export function ArchitectureReport() {
  const { query, update, report, exportPdf, exporting } = useSystemReport({
    path: ARCHITECTURE_REPORT_PATH,
    fileStem: 'reporte-arquitectura',
    schema: architecturePageSchema,
    ...ARCHITECTURE_REPORT_PARAMS,
  });
  const health = useSystemStatus();
  const data = report.data;
  const { service, event } = query;
  const flows = useMemo(() => filterFlows(FLOWS, { service, event }), [service, event]);
  const syncCalls = useMemo(() => (event ? [] : syncCallsFor(service)), [service, event]);

  return (
    <>
      <SystemReportHeader
        title="Arquitectura"
        scope="todo el sistema"
        onExport={exportPdf}
        exporting={exporting}
        disabled={!data}
      />
      <p className="max-w-3xl text-muted-foreground">
        Cada servicio guarda sus propios datos y avisa a los demás con eventos por Pub/Sub. Elige un
        servicio en el diagrama o un evento para ver por dónde viaja.
      </p>

      <ReportHighlights items={HIGHLIGHTS} />

      <ReportFilters
        narrowed={Boolean(service || event)}
        onClear={() => update({ service: undefined, event: undefined, page: 1 })}
      >
        <OptionSelect
          id="architecture-service"
          label="Servicio"
          placeholder="Todos los servicios"
          noneLabel="Todos los servicios"
          options={ARCHITECTURE_UNITS.map((unit) => ({ value: unit, label: UNIT_LABELS[unit] }))}
          total={ARCHITECTURE_UNITS.length}
          value={service ?? ''}
          onChange={(value) =>
            update({ service: (value || undefined) as ArchitectureUnit | undefined, page: 1 })
          }
          search=""
          onSearchChange={noSearch}
          searchLabel="Buscar servicio"
          emptyMessage="No hay servicios."
        />
        <OptionSelect
          id="architecture-event"
          label="Evento"
          placeholder="Todos los eventos"
          noneLabel="Todos los eventos"
          options={EVENT_TYPES.map((type) => ({ value: type, label: type }))}
          total={EVENT_TYPES.length}
          value={event ?? ''}
          onChange={(value) =>
            update({ event: (value || undefined) as EventType | undefined, page: 1 })
          }
          search=""
          onSearchChange={noSearch}
          searchLabel="Buscar evento"
          emptyMessage="No hay eventos."
        />
      </ReportFilters>

      <section
        aria-label="Diagrama de la arquitectura"
        className="flex animate-arrive flex-col gap-4 rounded-[30px] bg-sky-100 p-4 md:p-6 motion-reduce:animate-none"
      >
        <div className="overflow-x-auto">
          <ArchitectureDiagram
            flows={flows}
            syncCalls={syncCalls}
            health={health.data?.units}
            service={service}
            event={event}
            onSelectService={(unit) => update({ service: unit, page: 1 })}
          />
        </div>
        <p className="text-sm text-muted-foreground md:hidden">
          Desliza para ver todo el diagrama.
        </p>
        <Legend />
      </section>

      <DataTable
        caption="Eventos entre servicios"
        columns={columns}
        data={data?.items ?? []}
        getRowId={(row) => row.type}
        isLoading={report.isPending}
        isRefreshing={report.isPlaceholderData}
        error={report.isError ? 'No pudimos cargar el reporte.' : null}
        onRetry={() => void report.refetch()}
        emptyMessage="Ningún evento coincide con los filtros."
        pagination={tablePagination(query, data?.total, update, data?.items.length)}
        minWidth={960}
      />
    </>
  );
}
