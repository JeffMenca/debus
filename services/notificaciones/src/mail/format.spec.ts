import { formatDate, formatDateTime, formatMoney, formatSeats } from './format';

describe('email formatting', () => {
  it('shows an instant in Guatemala time, even when it is already the next day in UTC', () => {
    expect(formatDateTime('2026-10-25T05:30:00.000Z')).toBe(
      '24 de octubre de 2026 a las 11:30 p. m.',
    );
  });

  it('shows a calendar date without moving it to another day', () => {
    expect(formatDate('2026-11-01')).toBe('1 de noviembre de 2026');
  });

  it('shows quetzales with two decimals', () => {
    expect(formatMoney(1234.5)).toMatch(/^Q\s?1,234\.50$/);
    expect(formatMoney(85)).toMatch(/^Q\s?85\.00$/);
  });

  it('names one seat or lists several in reading order', () => {
    expect(formatSeats([5])).toBe('asiento 5');
    expect(formatSeats([7, 5, 6])).toBe('asientos 5, 6 y 7');
  });
});
