import { addDays } from './dates';

describe('addDays', () => {
  it.each([
    ['2026-10-19', 7, '2026-10-26'],
    ['2026-10-30', 3, '2026-11-02'],
    ['2026-12-30', 3, '2027-01-02'],
    ['2026-10-19', -60, '2026-08-20'],
    ['2026-10-19', 0, '2026-10-19'],
  ])('%s %i days -> %s', (day, days, expected) => {
    expect(addDays(day, days)).toBe(expected);
  });
});
