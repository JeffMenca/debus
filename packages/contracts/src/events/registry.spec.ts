import { BACKEND_SERVICES } from '../topology';
import { eventDrivenShare } from './sync-calls';
import {
  EVENT_REGISTRY,
  EVENT_TYPES,
  consumersOf,
  eventsConsumedBy,
  publisherOf,
} from './registry';

describe('event registry', () => {
  it('declares the 24 business event types plus the diagnostic probe', () => {
    const business = EVENT_TYPES.filter((type) => !EVENT_REGISTRY[type].diagnostic);

    expect(business).toHaveLength(24);
    expect(EVENT_REGISTRY.ProbeSent.diagnostic).toBe(true);
  });

  it('declares exactly the 25 agreed event names, in registry order', () => {
    expect(EVENT_TYPES).toEqual([
      'BranchCreated',
      'BranchUpdated',
      'SettingsUpdated',
      'UserRegistered',
      'AccountLinkSent',
      'RepairExpenseAdded',
      'BusAdded',
      'BusUpdated',
      'BusDeactivated',
      'DriverAdded',
      'DriverUpdated',
      'RouteCreated',
      'RouteUpdated',
      'RouteDeleted',
      'TripScheduled',
      'TripDeleted',
      'TripDeparted',
      'TripCompleted',
      'TicketSold',
      'RefundRequested',
      'RentalPaid',
      'ProfileUpdated',
      'WalletCredited',
      'UserUpdated',
      'ProbeSent',
    ]);
  });

  it('lets administracion follow the buses of flota', () => {
    expect(consumersOf('BusUpdated')).toEqual(['viajes', 'reportes', 'administracion']);
    expect(eventsConsumedBy('administracion')).toEqual(
      expect.arrayContaining(['BusAdded', 'BusUpdated', 'BusDeactivated', 'TripCompleted']),
    );
  });

  it('sends account links from administracion to notificaciones', () => {
    expect(publisherOf('AccountLinkSent')).toBe('administracion');
    expect(consumersOf('AccountLinkSent')).toEqual(['notificaciones']);
  });

  it('never lets a service consume its own events', () => {
    for (const type of EVENT_TYPES) {
      expect(consumersOf(type)).not.toContain(publisherOf(type));
      expect(consumersOf(type).length).toBeGreaterThan(0);
    }
  });

  it('delivers the probe to every backend service', () => {
    expect([...consumersOf('ProbeSent')].sort()).toEqual([...BACKEND_SERVICES].sort());
    expect(publisherOf('ProbeSent')).toBe('gateway');
  });

  it('tells ventas the NIT of every client profile, to link counter sales', () => {
    expect(publisherOf('ProfileUpdated')).toBe('clientes');
    expect(consumersOf('ProfileUpdated')).toEqual(['ventas']);
  });

  it('tells notificaciones everything it sends an email or an alert for', () => {
    expect(publisherOf('WalletCredited')).toBe('clientes');
    expect(consumersOf('WalletCredited')).toEqual(['notificaciones']);
    expect(publisherOf('UserUpdated')).toBe('administracion');
    expect(consumersOf('UserUpdated')).toEqual(['notificaciones']);
    expect(eventsConsumedBy('notificaciones')).toEqual([
      'UserRegistered',
      'AccountLinkSent',
      'DriverAdded',
      'DriverUpdated',
      'TripDeleted',
      'TicketSold',
      'RentalPaid',
      'WalletCredited',
      'UserUpdated',
      'ProbeSent',
    ]);
  });

  it('lists what each consumer listens to', () => {
    expect(eventsConsumedBy('clientes')).toEqual(
      expect.arrayContaining([
        'SettingsUpdated',
        'UserRegistered',
        'TicketSold',
        'RefundRequested',
        'ProbeSent',
      ]),
    );
    expect(eventsConsumedBy('clientes')).not.toContain('RentalPaid');
  });

  it('feeds the branch reports with every event they read', () => {
    expect(eventsConsumedBy('reportes')).toEqual(
      expect.arrayContaining([
        'DriverAdded',
        'DriverUpdated',
        'TripDeparted',
        'TripDeleted',
        'SettingsUpdated',
      ]),
    );
    expect(eventDrivenShare()).toBeCloseTo(24 / 27);
  });
});
