import { EVENT_TYPES } from '@debus/contracts';
import { EVENT_EFFECTS, architectureRows, architectureSums } from './system-architecture.rows';

describe('the architecture rows', () => {
  it('explains what every registered event causes', () => {
    for (const type of EVENT_TYPES) expect(EVENT_EFFECTS[type]).toMatch(/\S/);
  });

  it('carries every event with its topic, subscriptions and effect', () => {
    const rows = architectureRows({});

    expect(rows).toHaveLength(EVENT_TYPES.length);
    expect(rows.find((row) => row.type === 'RefundRequested')).toEqual({
      type: 'RefundRequested',
      publisher: 'ventas',
      topic: 'ventas-events',
      consumers: [{ service: 'clientes', subscription: 'clientes-from-ventas' }],
      diagnostic: false,
      effect: EVENT_EFFECTS.RefundRequested,
    });
  });

  it('keeps the events of a service or a single event', () => {
    expect(architectureRows({ service: 'clientes' }).map((row) => row.type)).not.toContain(
      'RouteCreated',
    );
    expect(architectureRows({ event: 'TripDeleted' }).map((row) => row.type)).toEqual([
      'TripDeleted',
    ]);
  });

  it('adds up the events and the subscriptions they travel through', () => {
    expect(architectureSums(architectureRows({ event: 'TicketSold' }))).toEqual({
      events: 1,
      subscriptions: 3,
    });
  });
});
