import { BACKEND_SERVICES, type BackendService } from '../topology';

export type EventProducer = BackendService | 'gateway';

export interface EventDefinition {
  readonly publisher: EventProducer;
  readonly consumers: readonly BackendService[];
  readonly diagnostic?: boolean;
}

const branchConsumers: BackendService[] = ['flota', 'viajes', 'ventas', 'reportes'];
const busConsumers: BackendService[] = ['viajes', 'reportes'];
const driverConsumers: BackendService[] = ['viajes', 'notificaciones'];
const routeConsumers: BackendService[] = ['viajes', 'reportes'];

const definitions = {
  SucursalCreada: { publisher: 'administracion', consumers: branchConsumers },
  SucursalActualizada: { publisher: 'administracion', consumers: branchConsumers },
  ConfiguracionActualizada: { publisher: 'administracion', consumers: ['viajes', 'clientes'] },
  UsuarioRegistrado: { publisher: 'administracion', consumers: ['clientes'] },
  EnlaceDeCuentaEmitido: { publisher: 'administracion', consumers: ['notificaciones'] },
  GastoTallerRegistrado: { publisher: 'administracion', consumers: ['reportes'] },
  BusRegistrado: { publisher: 'flota', consumers: busConsumers },
  BusActualizado: { publisher: 'flota', consumers: busConsumers },
  BusDesactivado: { publisher: 'flota', consumers: busConsumers },
  ChoferRegistrado: { publisher: 'flota', consumers: driverConsumers },
  ChoferActualizado: { publisher: 'flota', consumers: driverConsumers },
  RutaCreada: { publisher: 'flota', consumers: routeConsumers },
  RutaEliminada: { publisher: 'flota', consumers: routeConsumers },
  ViajeProgramado: { publisher: 'viajes', consumers: ['ventas', 'reportes'] },
  ViajeEliminado: { publisher: 'viajes', consumers: ['ventas', 'notificaciones'] },
  SalidaRegistrada: { publisher: 'viajes', consumers: ['flota'] },
  ViajeCompletado: { publisher: 'viajes', consumers: ['administracion', 'flota', 'reportes'] },
  BoletoVendido: { publisher: 'ventas', consumers: ['reportes', 'notificaciones', 'clientes'] },
  ReembolsoSolicitado: { publisher: 'ventas', consumers: ['clientes'] },
  AlquilerPagado: { publisher: 'clientes', consumers: ['viajes', 'reportes', 'notificaciones'] },
  SondeoEmitido: { publisher: 'gateway', consumers: [...BACKEND_SERVICES], diagnostic: true },
} satisfies Record<string, EventDefinition>;

export type EventType = keyof typeof definitions;
export const EVENT_REGISTRY: Readonly<Record<EventType, EventDefinition>> = definitions;
export const EVENT_TYPES = Object.keys(definitions) as EventType[];

export function publisherOf(type: EventType): EventProducer {
  return EVENT_REGISTRY[type].publisher;
}

export function consumersOf(type: EventType): readonly BackendService[] {
  return EVENT_REGISTRY[type].consumers;
}

export function eventsConsumedBy(consumer: BackendService): EventType[] {
  return EVENT_TYPES.filter((type) => consumersOf(type).includes(consumer));
}
