import {
  type ArchitectureFilter,
  type ArchitectureRow,
  type EventType,
  eventFlows,
  filterFlows,
} from '@debus/contracts';

// What each event causes in the services that receive it, for the system administrator.
export const EVENT_EFFECTS: Record<EventType, string> = {
  BranchCreated: 'Cada servicio guarda su copia de la nueva sucursal.',
  BranchUpdated: 'Cada servicio actualiza su copia de la sucursal (nombre, estado y ubicación).',
  SettingsUpdated:
    'Viajes fija la depreciación, Clientes calcula el precio de los alquileres y Reportes los costos.',
  UserRegistered: 'Clientes crea el perfil y la cartera; Notificaciones conoce a los admins.',
  UserUpdated: 'Notificaciones actualiza su copia; Clientes crea el perfil si faltaba.',
  AccountLinkSent: 'Notificaciones envía el correo con el enlace de la cuenta.',
  RepairExpenseAdded: 'Reportes suma el gasto de taller.',
  BusAdded: 'Viajes puede programarlo, Administración registrar sus gastos y Reportes lo cuenta.',
  BusUpdated: 'Viajes, Administración y Reportes actualizan su copia del bus.',
  BusDeactivated: 'El bus deja de poder programarse y de recibir gastos.',
  DriverAdded: 'Administración crea su cuenta y Notificaciones vigila su licencia.',
  DriverUpdated: 'Se actualizan la cuenta, la licencia y la copia del chofer.',
  RouteCreated: 'Viajes puede programar viajes en la ruta y Reportes la muestra.',
  RouteUpdated: 'Viajes y Reportes actualizan su copia de la ruta.',
  RouteDeleted: 'La ruta deja de poder programarse.',
  TripScheduled: 'Ventas lo pone a la venta y Flota aparta el bus y el chofer.',
  TripDeleted:
    'Ventas cierra las compras y pide los reembolsos, Notificaciones avisa y Flota libera el bus.',
  TripDeparted: 'Ventas cierra la venta y Flota marca el bus en camino.',
  TripCompleted:
    'Administración guarda los costos, Flota libera el bus y Reportes registra combustible y depreciación.',
  TicketSold: 'Reportes suma el ingreso y Notificaciones envía el boleto por correo.',
  RefundRequested: 'Clientes devuelve lo cobrado a la cartera.',
  RentalPaid: 'Viajes lo deja listo para asignar bus y chofer, y Reportes suma el ingreso.',
  ProfileUpdated: 'Ventas enlaza las ventas de ventanilla por NIT.',
  WalletCredited: 'Notificaciones envía el comprobante.',
  RentalConfirmed: 'Notificaciones avisa al cliente que ya puede pagar.',
  RentalCancelled: 'Clientes devuelve el pago y Reportes quita el ingreso.',
  ProbeSent: 'Aviso de prueba que los siete servicios anotan al recibirlo.',
};

// The registry is fixed in the code, so the rows come from it and not from the database.
export const architectureRows = (filter: ArchitectureFilter): ArchitectureRow[] =>
  filterFlows(eventFlows(), filter).map((flow) => ({ ...flow, effect: EVENT_EFFECTS[flow.type] }));

export const architectureSums = (rows: ArchitectureRow[]) => ({
  events: rows.length,
  subscriptions: rows.reduce((sum, row) => sum + row.consumers.length, 0),
});
