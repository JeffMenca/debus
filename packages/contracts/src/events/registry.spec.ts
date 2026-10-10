import { BACKEND_SERVICES } from '../topology';
import {
  EVENT_REGISTRY,
  EVENT_TYPES,
  consumersOf,
  eventsConsumedBy,
  publisherOf,
} from './registry';

describe('event registry', () => {
  it('declares the 20 business event types plus the diagnostic probe', () => {
    const business = EVENT_TYPES.filter((type) => !EVENT_REGISTRY[type].diagnostic);

    expect(business).toHaveLength(20);
    expect(EVENT_REGISTRY.ProbeSent.diagnostic).toBe(true);
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
});
