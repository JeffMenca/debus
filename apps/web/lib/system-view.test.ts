import {
  PROBE_TIMEOUT_MS,
  circuitView,
  deliveryView,
  healthView,
  probeFinished,
} from './system-view';

const probe = (states: ('received' | 'pending')[]) => ({
  probeId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  services: states.map((state) => ({ service: 'flota' as const, state })),
});

describe('system view', () => {
  it('describes health without technical words', () => {
    expect(healthView('up')).toEqual({ label: 'En línea', tone: 'mint', live: false });
    expect(healthView('down')).toEqual({ label: 'Sin respuesta', tone: 'rose', live: false });
  });

  it('waits for slow services until the timeout', () => {
    expect(deliveryView('received', 0)).toEqual({ label: 'Recibido', tone: 'mint', live: false });
    expect(deliveryView('pending', 1000)).toEqual({
      label: 'Esperando',
      tone: 'mango',
      live: true,
    });
    expect(deliveryView('unreachable', 1000).label).toBe('Esperando');
    expect(deliveryView('pending', PROBE_TIMEOUT_MS)).toEqual({
      label: 'No llegó',
      tone: 'rose',
      live: false,
    });
  });

  it('stops polling when everyone received the probe or time ran out', () => {
    expect(probeFinished(undefined, 0)).toBe(false);
    expect(probeFinished(probe(['received', 'pending']), 1000)).toBe(false);
    expect(probeFinished(probe(['received', 'received']), 1000)).toBe(true);
    expect(probeFinished(probe(['pending']), PROBE_TIMEOUT_MS)).toBe(true);
  });

  it('describes a normal connection', () => {
    expect(circuitView('closed', null)).toEqual({ label: 'Normal', tone: 'mint', live: false });
  });

  it('says until when a paused connection waits, in Guatemalan time', () => {
    // 16:32:05 UTC is 10:32:05 in Guatemala (UTC-6, no daylight saving time)
    expect(circuitView('open', '2026-10-19T16:32:05.000Z')).toEqual({
      label: 'En pausa hasta 10:32:05',
      tone: 'rose',
      live: false,
    });
  });

  it('shows a connection that is being tested as live', () => {
    expect(circuitView('half-open', '2026-10-19T16:32:05.000Z')).toEqual({
      label: 'Probando de nuevo',
      tone: 'mango',
      live: true,
    });
  });

  it('does not invent a time for a paused connection that has none', () => {
    expect(circuitView('open', null).label).toBe('En pausa');
  });
});
