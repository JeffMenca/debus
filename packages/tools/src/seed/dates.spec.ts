import { addDays, paidOnFor } from './dates';

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

describe('paidOnFor', () => {
  it('is stable for the same key', () => {
    expect(paidOnFor('2026-10-26', 'ticket:a')).toBe(paidOnFor('2026-10-26', 'ticket:a'));
  });

  it('is never after today and at most 13 days before', () => {
    for (let n = 0; n < 200; n++) {
      const paid = paidOnFor('2026-10-26', `ticket:${n}`);
      expect(paid <= '2026-10-26').toBe(true);
      expect(paid >= '2026-10-13').toBe(true);
    }
  });

  it('spreads the dates over the 14 days', () => {
    const days = new Set<string>();
    for (let n = 0; n < 300; n++) days.add(paidOnFor('2026-10-26', `ticket:${n}`));
    expect(days.size).toBe(14);
  });
});
