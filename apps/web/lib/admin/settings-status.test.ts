import type { SettingsVersion } from '@debus/contracts';
import { versionStatus } from './settings-status';

const version = (id: string, effectiveFrom: string, createdAt: string): SettingsVersion => ({
  id,
  depreciationPerKm: 1,
  rentalRatePerKm: 10,
  effectiveFrom,
  createdAt,
  createdByName: null,
});
const old = version('old', '2026-10-01', '2026-09-30T10:00:00.000Z');
const now = version('now', '2026-10-10', '2026-10-10T08:00:00.000Z');
const soon = version('soon', '2026-11-01', '2026-10-10T09:00:00.000Z');
const today = '2026-10-10';

describe('versionStatus', () => {
  it('tells the version in force, the scheduled ones and the past ones', () => {
    expect(versionStatus(now, now, today)).toBe('current');
    expect(versionStatus(soon, now, today)).toBe('scheduled');
    expect(versionStatus(old, now, today)).toBe('past');
  });

  it('calls past a version that starts today but lost to a later one the same day', () => {
    const sameDay = version('same', '2026-10-10', '2026-10-10T07:00:00.000Z');

    expect(versionStatus(sameDay, now, today)).toBe('past');
  });
});
