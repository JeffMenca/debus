import { rangeLabel, readRange, writeRange } from './range';

describe('rangeLabel', () => {
  it('names the four ways a period can be', () => {
    expect(rangeLabel({})).toBe('Todos los registros');
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-13' })).toBe('1 oct. 2026 – 13 oct. 2026');
    expect(rangeLabel({ from: '2026-10-01' })).toBe('Desde el 1 oct. 2026');
    expect(rangeLabel({ to: '2026-10-13' })).toBe('Hasta el 13 oct. 2026');
  });

  it('writes the same month names in every runtime', () => {
    expect(rangeLabel({ from: '2026-09-05' })).toBe('Desde el 5 sep. 2026');
  });
});

describe('readRange', () => {
  it('reads the period from the address', () => {
    expect(readRange(new URLSearchParams('desde=2026-10-01&hasta=2026-10-13'))).toEqual({
      from: '2026-10-01',
      to: '2026-10-13',
    });
    expect(readRange(new URLSearchParams(''))).toEqual({});
  });

  it('ignores invalid dates and a "hasta" before the "desde"', () => {
    expect(readRange(new URLSearchParams('desde=ayer&hasta=2026-13-45'))).toEqual({});
    expect(readRange(new URLSearchParams('desde=2026-10-10&hasta=2026-10-01'))).toEqual({
      from: '2026-10-10',
    });
  });
});

describe('writeRange', () => {
  it('writes only the keys that have a value', () => {
    const params = new URLSearchParams();
    writeRange(params, {});
    expect(params.toString()).toBe('');
    writeRange(params, { from: '2026-10-01', to: '2026-10-13' });
    expect(params.toString()).toBe('desde=2026-10-01&hasta=2026-10-13');
  });
});
