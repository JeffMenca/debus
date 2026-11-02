import {
  ARCHITECTURE_UNIT_LABELS,
  type ArchitectureQuery,
  architectureTotals,
  syncCallLabel,
  syncCallsFor,
} from '@debus/contracts';
import type { PdfColumn, ReportDocument } from '../../common/pdf/report-document';
import { formatPercent } from '../../common/report-format';
import { architectureRows } from './system-architecture.rows';

const EVENT_COLUMNS: PdfColumn[] = [
  { header: 'Evento', width: 'auto' },
  { header: 'Lo publica', width: 'auto' },
  { header: 'Lo reciben (suscripción)', width: 'auto' },
  { header: 'Qué provoca', width: '*' },
];
const CALL_COLUMNS: PdfColumn[] = [
  { header: 'Llama', width: 'auto' },
  { header: 'A', width: 'auto' },
  { header: 'Para', width: '*' },
];

const NOTES = [
  'Los servicios se comunican por Google Cloud Pub/Sub: cada uno publica en su tópico (<servicio>-events) y recibe por una suscripción push por publicador (<consumidor>-from-<publicador>), con una cola de errores por servicio (<consumidor>-dlq).',
  'Cada evento se guarda en el outbox en la misma transacción que el cambio y cada servicio lo procesa una sola vez (inbox por eventId). ProbeSent es un aviso de diagnóstico y no cuenta como evento de negocio.',
];

export interface ArchitectureDocumentInput {
  query: ArchitectureQuery;
  now: Date;
}

export function toReportDocument({ query, now }: ArchitectureDocumentInput): ReportDocument {
  const rows = architectureRows(query);
  const calls = query.event ? [] : syncCallsFor(query.service);
  const totals = architectureTotals();
  return {
    title: 'Arquitectura',
    scope: 'Todo el sistema',
    period: null,
    filters: [
      ...(query.service ? [`Servicio: ${ARCHITECTURE_UNIT_LABELS[query.service]}`] : []),
      ...(query.event ? [`Evento: ${query.event}`] : []),
    ],
    highlights: [
      { label: 'Eventos de negocio', value: String(totals.events) },
      { label: 'Llamadas directas', value: String(totals.syncCalls) },
      { label: 'Comunicación por eventos', value: formatPercent(totals.eventShare * 100) },
      { label: 'Eventos con estos filtros', value: String(rows.length) },
    ],
    tables: [
      {
        title: 'Eventos entre servicios',
        columns: EVENT_COLUMNS,
        rows: rows.map((row) => ({
          cells: [
            row.type,
            `${ARCHITECTURE_UNIT_LABELS[row.publisher]}\n${row.topic}`,
            row.consumers.map(({ subscription }) => subscription).join('\n'),
            row.effect,
          ],
        })),
        emptyMessage: 'Ningún evento coincide con los filtros.',
      },
      {
        title: 'Llamadas directas (con circuit breaker)',
        columns: CALL_COLUMNS,
        rows: calls.map((call) => ({
          cells: [
            ARCHITECTURE_UNIT_LABELS[call.from],
            ARCHITECTURE_UNIT_LABELS[call.to],
            syncCallLabel(call),
          ],
        })),
        emptyMessage: 'Ninguna llamada directa coincide con los filtros.',
      },
    ],
    notes: NOTES,
    generatedAt: now,
    landscape: true,
  };
}
