import { PROBE_TIMEOUT_MS, deliveryView, healthView, probeFinished } from './system-view';

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
});
