import { fraction, uuidFrom } from './ids';

describe('uuidFrom', () => {
  it('gives the same UUID for the same text and another for another text', () => {
    expect(uuidFrom('repair:bus-1:0')).toBe(uuidFrom('repair:bus-1:0'));
    expect(uuidFrom('repair:bus-1:0')).not.toBe(uuidFrom('repair:bus-1:1'));
  });

  it('is a valid UUID', () => {
    expect(uuidFrom('anything')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('fraction', () => {
  it('is stable and stays in [0, 1)', () => {
    expect(fraction('sale:trip-1')).toBe(fraction('sale:trip-1'));
    for (let n = 0; n < 200; n++) {
      const value = fraction(`sale:${n}`);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads the values over the whole range', () => {
    const buckets = new Set<number>();
    for (let n = 0; n < 1000; n++) buckets.add(Math.floor(fraction(`k:${n}`) * 10));
    expect(buckets.size).toBe(10);
  });
});
