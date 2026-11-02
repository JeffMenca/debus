import { z } from 'zod';
import {
  EVENT_REGISTRY,
  EVENT_TYPES,
  type EventProducer,
  type EventType,
} from '../events/registry';
import { subscriptionName, topicName } from '../events/pubsub-names';
import { SYNC_CALLS, type SyncCall, eventDrivenShare } from '../events/sync-calls';
import { BACKEND_SERVICES, type BackendService } from '../topology';
import { pageQuerySchema } from './pagination';
import { noGroupsSchema, reportPageSchema } from './reports';

export type ArchitectureUnit = EventProducer;

// The gateway and the seven services; the web only talks to the gateway.
export const ARCHITECTURE_UNITS = ['gateway', ...BACKEND_SERVICES] as const satisfies readonly [
  ArchitectureUnit,
  ...ArchitectureUnit[],
];

// The names the system administrator reads; the web adds its own unit.
export const ARCHITECTURE_UNIT_LABELS: Record<ArchitectureUnit, string> = {
  gateway: 'Entrada principal',
  administracion: 'Administración',
  flota: 'Flota',
  viajes: 'Viajes',
  ventas: 'Ventas',
  clientes: 'Clientes',
  reportes: 'Reportes',
  notificaciones: 'Notificaciones',
};

// The purpose of a call in the registry is for developers; this is what the administrator reads.
const SYNC_CALL_LABELS: Record<string, string> = {
  'ventas>clientes': 'Cobrar con la cartera',
  'ventas>viajes': '¿Viaje a la venta?',
  'viajes>flota': '¿Bus y chofer libres?',
};
export const syncCallLabel = ({ from, to }: SyncCall): string => {
  const label = SYNC_CALL_LABELS[`${from}>${to}`];
  if (!label) throw new Error(`No label for the direct call ${from}>${to}`);
  return label;
};

export interface EventConsumer {
  service: BackendService;
  subscription: string;
}

export interface EventFlow {
  type: EventType;
  publisher: EventProducer;
  topic: string;
  consumers: EventConsumer[];
  diagnostic: boolean;
}

export function eventFlows(): EventFlow[] {
  return EVENT_TYPES.map((type) => {
    const { publisher, consumers, diagnostic } = EVENT_REGISTRY[type];
    return {
      type,
      publisher,
      topic: topicName(publisher),
      consumers: consumers.map((service) => ({
        service,
        subscription: subscriptionName(service, publisher),
      })),
      diagnostic: diagnostic ?? false,
    };
  });
}

export interface ArchitectureFilter {
  service?: ArchitectureUnit;
  event?: EventType;
}

export const touches = (flow: EventFlow, unit: ArchitectureUnit): boolean =>
  flow.publisher === unit || flow.consumers.some(({ service }) => service === unit);

export function filterFlows<F extends EventFlow>(
  flows: F[],
  { service, event }: ArchitectureFilter,
) {
  return flows.filter(
    (flow) => (!event || flow.type === event) && (!service || touches(flow, service)),
  );
}

export const syncCallsFor = (unit?: ArchitectureUnit): SyncCall[] =>
  SYNC_CALLS.filter((call) => !unit || call.from === unit || call.to === unit);

export function architectureTotals() {
  const events = EVENT_TYPES.filter((type) => !EVENT_REGISTRY[type].diagnostic).length;
  return { events, syncCalls: SYNC_CALLS.length, eventShare: eventDrivenShare() };
}

const count = z.number().int().nonnegative();

export const architectureQuerySchema = pageQuerySchema.extend({
  service: z.enum(ARCHITECTURE_UNITS).optional(),
  event: z.enum(EVENT_TYPES as [EventType, ...EventType[]]).optional(),
});
export type ArchitectureQuery = z.infer<typeof architectureQuerySchema>;

export const architectureRowSchema = z.object({
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  publisher: z.enum(ARCHITECTURE_UNITS),
  topic: z.string(),
  consumers: z.array(z.object({ service: z.enum(BACKEND_SERVICES), subscription: z.string() })),
  diagnostic: z.boolean(),
  // What the event causes in the services that receive it, for the system administrator.
  effect: z.string(),
});
export type ArchitectureRow = z.infer<typeof architectureRowSchema>;

export const architecturePageSchema = reportPageSchema(
  architectureRowSchema,
  z.object({ events: count, subscriptions: count }),
  noGroupsSchema,
);
export type ArchitecturePage = z.infer<typeof architecturePageSchema>;
