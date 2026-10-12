import { isLaterInstant, isoDateSchema, todayInGuatemala } from './dates';

describe('todayInGuatemala', () => {
  it('uses the Guatemala calendar day, six hours behind UTC', () => {
    expect(todayInGuatemala(new Date('2026-10-11T03:00:00Z'))).toBe('2026-10-10');
    expect(todayInGuatemala(new Date('2026-10-11T07:00:00Z'))).toBe('2026-10-11');
  });

  it('produces a value accepted by isoDateSchema', () => {
    expect(isoDateSchema.safeParse(todayInGuatemala()).success).toBe(true);
    expect(isoDateSchema.safeParse('10/10/2026').success).toBe(false);
  });
});

describe('isLaterInstant', () => {
  it('compares instants, not text', () => {
    expect(isLaterInstant('2026-10-20T10:00:01Z', '2026-10-20T10:00:00.500Z')).toBe(true);
    expect(isLaterInstant('2026-10-20T10:00:00Z', '2026-10-20T10:00:00.000Z')).toBe(false);
    expect(isLaterInstant('2026-10-20T10:00:00Z', '2026-10-20T10:00:00.500Z')).toBe(false);
  });
});
