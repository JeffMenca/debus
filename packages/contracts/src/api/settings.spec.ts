import { createSettingsRequestSchema, effectiveVersion, moneySchema } from './settings';

describe('money', () => {
  it('accepts positive amounts with up to two decimals', () => {
    expect(moneySchema.parse(1.25)).toBe(1.25);
    expect(moneySchema.parse(0.1 + 0.2 - 0.0000000000000001)).toBeCloseTo(0.3);
    expect(moneySchema.safeParse(1.255).success).toBe(false);
    expect(moneySchema.safeParse(0).success).toBe(false);
    expect(moneySchema.safeParse(-3).success).toBe(false);
  });
});

describe('settings request', () => {
  it('needs both rates and a calendar date', () => {
    expect(
      createSettingsRequestSchema.parse({
        depreciationPerKm: 1.5,
        rentalRatePerKm: 12,
        effectiveFrom: '2026-10-10',
      }),
    ).toEqual({ depreciationPerKm: 1.5, rentalRatePerKm: 12, effectiveFrom: '2026-10-10' });
    expect(
      createSettingsRequestSchema.safeParse({
        depreciationPerKm: 1.5,
        rentalRatePerKm: 12,
        effectiveFrom: '10/10/2026',
      }).success,
    ).toBe(false);
  });
});

describe('effectiveVersion', () => {
  const v = (id: string, effectiveFrom: string, createdAt: string) => ({
    id,
    effectiveFrom,
    createdAt,
  });
  const versions = [
    v('old', '2026-10-01', '2026-09-30T10:00:00.000Z'),
    v('same-day-first', '2026-10-10', '2026-10-10T08:00:00.000Z'),
    v('same-day-last', '2026-10-10', '2026-10-10T09:00:00.000Z'),
    v('future', '2026-11-01', '2026-10-10T09:30:00.000Z'),
  ];

  it('takes the latest version in force on that date', () => {
    expect(effectiveVersion(versions, '2026-10-05')?.id).toBe('old');
    expect(effectiveVersion(versions, '2026-10-10')?.id).toBe('same-day-last');
    expect(effectiveVersion(versions, '2026-11-01')?.id).toBe('future');
  });

  it('returns null before the first version', () => {
    expect(effectiveVersion(versions, '2026-09-01')).toBeNull();
    expect(effectiveVersion([], '2026-10-10')).toBeNull();
  });
});
