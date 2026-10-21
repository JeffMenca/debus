import { SYNC_CALLS, eventDrivenShare } from './sync-calls';

describe('communication share', () => {
  it('keeps the three synchronous calls: a paid rental is assigned by viajes, not by clientes', () => {
    expect(SYNC_CALLS.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'ventas->clientes',
      'ventas->viajes',
      'viajes->flota',
    ]);
    expect(SYNC_CALLS).toHaveLength(3);
    expect(SYNC_CALLS.some((call) => call.from === 'clientes')).toBe(false);
    expect(eventDrivenShare()).toBeCloseTo(24 / 27);
  });

  it('routes at least 50% of the communication through events', () => {
    expect(eventDrivenShare()).toBeGreaterThanOrEqual(0.5);
  });
});
