import { daysUntil, licenseTone } from './license';

describe('daysUntil', () => {
  it('counts whole calendar days from today', () => {
    expect(daysUntil('2026-10-12', '2026-10-12')).toBe(0);
    expect(daysUntil('2026-10-15', '2026-10-12')).toBe(3);
    expect(daysUntil('2026-10-10', '2026-10-12')).toBe(-2);
  });

  it('crosses months and years', () => {
    expect(daysUntil('2026-11-04', '2026-10-12')).toBe(23);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });

  it('is not moved by a daylight saving change in another zone', () => {
    expect(daysUntil('2026-11-02', '2026-10-31')).toBe(2);
    expect(daysUntil('2026-03-30', '2026-03-28')).toBe(2);
  });
});

describe('licenseTone', () => {
  it.each([
    [-10, 'coral'],
    [-1, 'coral'],
    [0, 'coral'],
    [15, 'coral'],
    [16, 'mango'],
    [30, 'mango'],
    [31, 'muted'],
    [400, 'muted'],
  ] as const)('paints %i days left as %s', (days, tone) => {
    expect(licenseTone(days)).toBe(tone);
  });
});
