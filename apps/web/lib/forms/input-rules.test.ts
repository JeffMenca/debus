import { inputRules } from './input-rules';

const clean = (rule: { sanitize?: (value: string) => string }, value: string) =>
  rule.sanitize!(value);

describe('inputRules', () => {
  it('keeps every digit of a pasted phone and stops at 8', () => {
    expect(clean(inputRules.phone, '5555-4444')).toBe('55554444');
    expect(clean(inputRules.phone, '5555-4444-99')).toBe('55554444');
    expect(clean(inputRules.phone, 'abc')).toBe('');
  });
  it('keeps the 13 digits of a DPI written with spaces', () => {
    expect(clean(inputRules.dpi, '2345 67890 1234 5')).toBe('2345678901234');
  });
  it('allows K only as the last character of a NIT', () => {
    expect(clean(inputRules.nit, '123-4k')).toBe('1234K');
    expect(clean(inputRules.nit, '12k34')).toBe('1234');
    expect(clean(inputRules.nit, '12345678901234k')).toBe('123456789012K');
  });
  it('allows CF only where a sale may have no NIT', () => {
    expect(clean(inputRules.nitOrCf, 'cf')).toBe('CF');
    expect(clean(inputRules.nitOrCf, '123-4k')).toBe('1234K');
    expect(clean(inputRules.nit, 'cf')).toBe('');
  });
  it('normalizes a plate', () => {
    expect(clean(inputRules.plate, 'p-123 abc9')).toBe('P123ABC9');
  });
  it('normalizes a license', () => {
    expect(clean(inputRules.license, 'ab-12 34')).toBe('AB1234');
  });
  it('leaves only the letters of a branch code', () => {
    expect(clean(inputRules.branchCode, 'g1ua-xyzq')).toBe('GUAXY');
  });
  it('limits whole and decimal digits', () => {
    const money = inputRules.decimal(7, 2);
    expect(clean(money, '12a3.456')).toBe('123.45');
    expect(clean(money, '1.2.3')).toBe('1.23');
    expect(clean(money, '123456789')).toBe('1234567');
  });
  it('accepts a sign only at the start of a coordinate', () => {
    expect(clean(inputRules.coordinate, '-90.1234567')).toBe('-90.123456');
    expect(clean(inputRules.coordinate, '9-0')).toBe('90');
  });
  it('limits an integer to its digits', () => {
    expect(clean(inputRules.integer(4), '2a0b26789')).toBe('2026');
  });
  it('limits free text through the browser', () => {
    expect(inputRules.text(40).maxLength).toBe(40);
    expect(inputRules.text(40).sanitize).toBeUndefined();
  });
});
