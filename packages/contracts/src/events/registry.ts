import { BACKEND_SERVICES, type BackendService } from '../topology';

export type EventProducer = BackendService | 'gateway';

export interface EventDefinition {
  readonly publisher: EventProducer;
  readonly consumers: readonly BackendService[];
  readonly diagnostic?: boolean;
}

const branchConsumers: BackendService[] = ['flota', 'viajes', 'ventas', 'reportes'];
const busConsumers: BackendService[] = ['viajes', 'reportes', 'administracion'];
const driverConsumers: BackendService[] = [
  'viajes',
  'notificaciones',
  'administracion',
  'reportes',
];
const routeConsumers: BackendService[] = ['viajes', 'reportes'];

const definitions = {
  BranchCreated: { publisher: 'administracion', consumers: branchConsumers },
  BranchUpdated: { publisher: 'administracion', consumers: branchConsumers },
  SettingsUpdated: { publisher: 'administracion', consumers: ['viajes', 'clientes', 'reportes'] },
  UserRegistered: { publisher: 'administracion', consumers: ['clientes', 'notificaciones'] },
  AccountLinkSent: { publisher: 'administracion', consumers: ['notificaciones'] },
  RepairExpenseAdded: { publisher: 'administracion', consumers: ['reportes'] },
  BusAdded: { publisher: 'flota', consumers: busConsumers },
  BusUpdated: { publisher: 'flota', consumers: busConsumers },
  BusDeactivated: { publisher: 'flota', consumers: busConsumers },
  DriverAdded: { publisher: 'flota', consumers: driverConsumers },
  DriverUpdated: { publisher: 'flota', consumers: driverConsumers },
  RouteCreated: { publisher: 'flota', consumers: routeConsumers },
  RouteUpdated: { publisher: 'flota', consumers: routeConsumers },
  RouteDeleted: { publisher: 'flota', consumers: routeConsumers },
  TripScheduled: { publisher: 'viajes', consumers: ['ventas', 'reportes', 'flota'] },
  TripDeleted: {
    publisher: 'viajes',
    consumers: ['ventas', 'notificaciones', 'flota', 'reportes'],
  },
  TripDeparted: { publisher: 'viajes', consumers: ['flota', 'reportes'] },
  TripCompleted: { publisher: 'viajes', consumers: ['administracion', 'flota', 'reportes'] },
  TicketSold: { publisher: 'ventas', consumers: ['reportes', 'notificaciones', 'clientes'] },
  RefundRequested: { publisher: 'ventas', consumers: ['clientes'] },
  RentalPaid: { publisher: 'clientes', consumers: ['viajes', 'reportes', 'notificaciones'] },
  ProfileUpdated: { publisher: 'clientes', consumers: ['ventas'] },
  WalletCredited: { publisher: 'clientes', consumers: ['notificaciones'] },
  UserUpdated: { publisher: 'administracion', consumers: ['notificaciones'] },
  ProbeSent: { publisher: 'gateway', consumers: [...BACKEND_SERVICES], diagnostic: true },
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
