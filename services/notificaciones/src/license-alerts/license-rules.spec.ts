import { addDays, alertsOutdated, daysUntil, dueThreshold } from './license-rules';

const today = '2026-10-21';

describe('license rules', () => {
  it('counts whole calendar days, whatever the month', () => {
    expect(daysUntil('2026-10-21', today)).toBe(0);
    expect(daysUntil('2026-11-20', today)).toBe(30);
    expect(daysUntil('2026-10-20', today)).toBe(-1);
    expect(addDays(today, 30)).toBe('2026-11-20');
  });

  it.each([
    [40, null],
    [31, null],
    [30, 30],
    [20, 30],
    [16, 30],
    [15, 15],
    [10, 15],
    [4, 15],
    [3, 3],
    [0, 3],
    [-1, null],
  ])('with %i days left the alert due is the %s day one', (days, threshold) => {
    expect(dueThreshold(addDays(today, days), today)).toBe(threshold);
  });

  it('drops what was scheduled when the date, the email or the branch change, or the driver leaves', () => {
    const before = {
      email: 'luis@correo.com',
      branchId: 'b-1',
      licenseExpiresOn: '2026-11-20',
      active: true,
    };

    expect(alertsOutdated(before, { ...before })).toBe(false);
    expect(alertsOutdated(before, { ...before, licenseExpiresOn: '2027-11-20' })).toBe(true);
    expect(alertsOutdated(before, { ...before, email: 'otro@correo.com' })).toBe(true);
    expect(alertsOutdated(before, { ...before, branchId: 'b-2' })).toBe(true);
    expect(alertsOutdated(before, { ...before, active: false })).toBe(true);
  });
});
