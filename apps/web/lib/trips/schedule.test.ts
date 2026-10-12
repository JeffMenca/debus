import { clashFieldOf, progressOf, splitGuatemala, suggestedArrival } from './schedule';

describe('suggestedArrival', () => {
  it('adds the hours the distance takes at 50 km/h, rounded up', () => {
    expect(suggestedArrival('2026-10-20T11:30:00.000Z', 201.5)).toBe('2026-10-20T16:30:00.000Z');
  });

  it('does not round a distance that fits exactly', () => {
    expect(suggestedArrival('2026-10-20T11:30:00.000Z', 150)).toBe('2026-10-20T14:30:00.000Z');
  });

  it('proposes at least one hour', () => {
    expect(suggestedArrival('2026-10-20T11:30:00.000Z', 10)).toBe('2026-10-20T12:30:00.000Z');
  });

  it('crosses midnight', () => {
    expect(suggestedArrival('2026-10-20T20:00:00.000Z', 400)).toBe('2026-10-21T04:00:00.000Z');
  });
});

describe('splitGuatemala', () => {
  it('gives the day and the time of Guatemala', () => {
    expect(splitGuatemala('2026-10-20T11:30:00.000Z')).toEqual({
      day: '2026-10-20',
      time: '05:30',
    });
  });

  it('keeps the day of Guatemala when UTC is already the next one', () => {
    expect(splitGuatemala('2026-10-21T03:15:00.000Z')).toEqual({
      day: '2026-10-20',
      time: '21:15',
    });
  });

  it('writes midnight as 00:00', () => {
    expect(splitGuatemala('2026-10-20T06:00:00.000Z')).toEqual({
      day: '2026-10-20',
      time: '00:00',
    });
  });
});

describe('clashFieldOf', () => {
  it.each([
    ['Ese bus ya tiene un viaje en ese horario.', 'bus'],
    ['Ese bus está en taller.', 'bus'],
    ['Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.', 'bus'],
    ['Ese chofer ya tiene un viaje en ese horario.', 'driver'],
    ['La licencia de ese chofer estará vencida el día del viaje.', 'driver'],
    ['Esa ruta está retirada. Reactívala o elige otra.', 'route'],
    ['Elige una ruta activa que salga de tu sucursal.', 'route'],
    ['La salida debe ser en el futuro.', 'departure'],
    ['No pudimos revisar la disponibilidad ahora. Intenta de nuevo.', null],
  ])('places "%s" on %s', (message, field) => {
    expect(clashFieldOf(message)).toBe(field);
  });
});

describe('progressOf', () => {
  const departure = '2026-10-20T10:00:00.000Z';
  const arrival = '2026-10-20T14:00:00.000Z';
  const at = (iso: string) => Date.parse(iso);

  it('is the share of the trip already driven', () => {
    expect(progressOf(departure, arrival, at('2026-10-20T11:00:00.000Z'))).toBe(0.25);
    expect(progressOf(departure, arrival, at('2026-10-20T12:00:00.000Z'))).toBe(0.5);
  });

  it('stays inside the trip when the bus runs early or late', () => {
    expect(progressOf(departure, arrival, at('2026-10-20T09:00:00.000Z'))).toBe(0);
    expect(progressOf(departure, arrival, at('2026-10-20T18:00:00.000Z'))).toBe(1);
  });
});
