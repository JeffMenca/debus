import { SYNC_CALLS, eventDrivenShare } from './sync-calls';

describe('communication share', () => {
  it('keeps the four synchronous calls of the base plan', () => {
    expect(SYNC_CALLS.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'ventas->clientes',
      'ventas->viajes',
      'viajes->flota',
      'clientes->flota',
    ]);
  });

  it('routes at least 50% of the communication through events', () => {
    expect(eventDrivenShare()).toBeGreaterThanOrEqual(0.5);
  });
});
