import { ApiError } from '@/lib/api/client';
import { balanceAfter, keepsKey, partOfDay, seatsLeft, ticketCode, tripDuration } from './purchase';

describe('balanceAfter', () => {
  it('counts in cents, so the balance never ends in a long tail', () => {
    expect(balanceAfter(340, 170)).toBe(170);
    expect(balanceAfter(100.1, 33.35 * 3)).toBe(0.05);
    expect(balanceAfter(50, 85)).toBe(-35);
  });
});

describe('ticketCode', () => {
  it('reads the ticket by the first six characters of its id', () => {
    expect(ticketCode('0f3a21c4-8b0a-4f8e-9d6c-5b4a3f2e4d1c')).toBe('BOL-0F3A21');
  });
});

describe('keepsKey', () => {
  it('keeps the key only when the answer never arrived, so the retry is the same purchase', () => {
    expect(keepsKey(new ApiError(0, 'sin conexión'))).toBe(true);
    expect(keepsKey(new ApiError(409, 'vendido'))).toBe(false);
    expect(keepsKey(new ApiError(503, 'sin cobro'))).toBe(false);
    expect(keepsKey(null)).toBe(false);
  });
});

describe('seatsLeft', () => {
  it('says how many are free and fills the bar with the taken ones', () => {
    expect(seatsLeft(18, 40)).toEqual({ label: '18 de 40 libres', tone: 'plenty', taken: 0.55 });
  });

  it('warns when few are left', () => {
    expect(seatsLeft(4, 40)).toMatchObject({ label: '¡Solo quedan 4!', tone: 'few' });
    expect(seatsLeft(1, 40).label).toBe('¡Solo queda 1!');
  });

  it('says when none is left', () => {
    expect(seatsLeft(0, 40)).toEqual({ label: 'Sin asientos libres', tone: 'none', taken: 1 });
  });
});

describe('tripDuration', () => {
  it('reads the length of a trip in hours and minutes', () => {
    expect(tripDuration('2026-10-20T11:30:00.000Z', '2026-10-20T15:45:00.000Z')).toBe('4 h 15 min');
    expect(tripDuration('2026-10-20T11:30:00.000Z', '2026-10-20T14:30:00.000Z')).toBe('3 h');
    expect(tripDuration('2026-10-20T11:30:00.000Z', '2026-10-20T12:15:00.000Z')).toBe('45 min');
  });
});

describe('partOfDay', () => {
  it('names the part of the day of a departure', () => {
    expect(partOfDay('05:30')).toBe('Madrugada');
    expect(partOfDay('08:00')).toBe('Mañana');
    expect(partOfDay('11:59')).toBe('Mañana');
    expect(partOfDay('12:30')).toBe('Mediodía');
    expect(partOfDay('15:00')).toBe('Tarde');
    expect(partOfDay('19:00')).toBe('Noche');
    expect(partOfDay('00:15')).toBe('Madrugada');
  });
});
