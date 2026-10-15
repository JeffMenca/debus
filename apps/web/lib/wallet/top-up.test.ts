import { DEFAULT_TOP_UP, TOP_UP_PRESETS, parseTopUpAmount, topUpLabel } from './top-up';

describe('top-up helpers', () => {
  it('suggests the amounts of the reference, starting on Q 100', () => {
    expect(TOP_UP_PRESETS).toEqual([50, 100, 200, 500]);
    expect(DEFAULT_TOP_UP).toBe(100);
  });

  it('accepts a positive amount with up to two decimals the API would accept', () => {
    expect(parseTopUpAmount('150.50')).toBe(150.5);
    expect(parseTopUpAmount('1,000')).toBe(1000);
    expect(parseTopUpAmount('0')).toBeNull();
    expect(parseTopUpAmount('10.555')).toBeNull();
    expect(parseTopUpAmount('200000')).toBeNull();
    expect(parseTopUpAmount('')).toBeNull();
  });

  it('names the amount on the button', () => {
    expect(topUpLabel(100)).toMatch(/^Recargar Q\s?100\.00$/);
    expect(topUpLabel(null)).toBe('Recargar');
  });
});
