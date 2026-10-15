import { formatDay, formatInstant, formatKm, formatMoney, reportPeriod } from './report-format';

describe('report formats', () => {
  it('writes money in quetzales with thousands separators and two decimals', () => {
    expect(formatMoney(1234.5)).toBe('Q 1,234.50');
    expect(formatMoney(0)).toBe('Q 0.00');
    expect(formatMoney(1500000)).toBe('Q 1,500,000.00');
  });

  it('writes kilometers as whole numbers', () => {
    expect(formatKm(1204)).toBe('1,204 km');
    expect(formatKm(0)).toBe('0 km');
    expect(formatKm(1204.4)).toBe('1,204 km');
  });

  it('writes a day with the abbreviated month, the same in every runtime', () => {
    expect(formatDay('2026-10-13')).toBe('13 oct. 2026');
    expect(formatDay('2026-01-05')).toBe('5 ene. 2026');
    expect(formatDay('2026-09-30')).toBe('30 sep. 2026');
  });

  it('writes an instant in Guatemala time', () => {
    expect(formatInstant('2026-10-13T21:20:00Z')).toBe('13/10/2026 15:20');
    expect(formatInstant(new Date('2026-10-14T05:59:00Z'))).toBe('13/10/2026 23:59');
    expect(formatInstant('2026-10-14T06:00:00.000Z')).toBe('14/10/2026 00:00');
  });

  it('describes the period of a report', () => {
    expect(reportPeriod()).toBe('Todos los registros');
    expect(reportPeriod('2026-10-01', '2026-10-13')).toBe('Del 1 oct. 2026 al 13 oct. 2026');
    expect(reportPeriod('2026-10-01')).toBe('Desde el 1 oct. 2026');
    expect(reportPeriod(undefined, '2026-10-13')).toBe('Hasta el 13 oct. 2026');
  });
});
