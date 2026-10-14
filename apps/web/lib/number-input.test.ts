import { parseMoney, parseWholeNumber } from './number-input';

describe('parseWholeNumber', () => {
  it.each([
    ['148614', 148614],
    ['148,614', 148614],
    [' 1 200 ', 1200],
    ['0', 0],
  ])('reads %s as %d', (text, value) => expect(parseWholeNumber(text)).toBe(value));

  it.each(['', 'abc', '10.5', '-3', '1e3'])('refuses %j', (text) =>
    expect(parseWholeNumber(text)).toBeNull(),
  );
});

describe('parseMoney', () => {
  it.each([
    ['1180', 1180],
    ['1,180.50', 1180.5],
    ['5200.5', 5200.5],
    ['0.85', 0.85],
  ])('reads %s as %d', (text, value) => expect(parseMoney(text)).toBe(value));

  it.each(['', 'q', '1.234', '-5', '1,18,0.5.0'])('refuses %j', (text) =>
    expect(parseMoney(text)).toBeNull(),
  );
});
