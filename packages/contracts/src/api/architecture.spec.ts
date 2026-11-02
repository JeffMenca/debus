import { EVENT_TYPES } from '../events/registry';
import { SYNC_CALLS } from '../events/sync-calls';
import {
  ARCHITECTURE_UNITS,
  ARCHITECTURE_UNIT_LABELS,
  syncCallLabel,
  architectureQuerySchema,
  architectureTotals,
  eventFlows,
  filterFlows,
  syncCallsFor,
} from './architecture';

describe('eventFlows', () => {
  it('lists every registered event with its topic and one subscription per consumer', () => {
    const flows = eventFlows();

    expect(flows.map((flow) => flow.type)).toEqual(EVENT_TYPES);
    expect(flows.find((flow) => flow.type === 'TicketSold')).toEqual({
      type: 'TicketSold',
      publisher: 'ventas',
      topic: 'ventas-events',
      consumers: [
        { service: 'reportes', subscription: 'reportes-from-ventas' },
        { service: 'notificaciones', subscription: 'notificaciones-from-ventas' },
        { service: 'clientes', subscription: 'clientes-from-ventas' },
      ],
      diagnostic: false,
    });
  });

  it('marks the status probe as diagnostic', () => {
    expect(eventFlows().find((flow) => flow.type === 'ProbeSent')?.diagnostic).toBe(true);
  });
});

describe('filterFlows', () => {
  const flows = eventFlows();

  it('keeps everything without filters', () => {
    expect(filterFlows(flows, {})).toHaveLength(EVENT_TYPES.length);
  });

  it('keeps the events a service publishes or receives', () => {
    const types = filterFlows(flows, { service: 'clientes' }).map((flow) => flow.type);

    expect(types).toContain('RentalPaid');
    expect(types).toContain('RefundRequested');
    expect(types).not.toContain('RouteCreated');
  });

  it('keeps one event', () => {
    expect(filterFlows(flows, { event: 'TripDeleted' }).map((flow) => flow.type)).toEqual([
      'TripDeleted',
    ]);
  });
});

describe('syncCallsFor', () => {
  it('keeps every direct call without a service and only its own calls with one', () => {
    expect(syncCallsFor()).toEqual(SYNC_CALLS);
    expect(syncCallsFor('flota')).toEqual([SYNC_CALLS[2]]);
    expect(syncCallsFor('reportes')).toEqual([]);
  });
});

describe('architectureTotals', () => {
  it('counts business events apart from the probe, the direct calls and the event share', () => {
    expect(architectureTotals()).toEqual({ events: 26, syncCalls: 3, eventShare: 26 / 29 });
  });
});

describe('architectureQuerySchema', () => {
  it('reads a known unit and event with the page', () => {
    expect(
      architectureQuerySchema.parse({ service: 'gateway', event: 'TicketSold', page: '2' }),
    ).toEqual({ service: 'gateway', event: 'TicketSold', page: 2, pageSize: 20 });
  });

  it('refuses an unknown unit or event', () => {
    expect(architectureQuerySchema.safeParse({ service: 'x' }).success).toBe(false);
    expect(architectureQuerySchema.safeParse({ event: 'Nope' }).success).toBe(false);
  });

  it('lists the gateway and the seven services as the units', () => {
    expect(ARCHITECTURE_UNITS).toEqual([
      'gateway',
      'administracion',
      'flota',
      'viajes',
      'ventas',
      'clientes',
      'reportes',
      'notificaciones',
    ]);
  });
});

describe('the labels for the administrator', () => {
  it('names every unit and every direct call in Spanish', () => {
    for (const unit of ARCHITECTURE_UNITS) expect(ARCHITECTURE_UNIT_LABELS[unit]).toMatch(/\S/);
    expect(SYNC_CALLS.map(syncCallLabel)).toEqual([
      'Cobrar con la cartera',
      '¿Viaje a la venta?',
      '¿Bus y chofer libres?',
    ]);
    expect(() => syncCallLabel({ from: 'flota', to: 'ventas', purpose: 'x' })).toThrow();
  });
});
