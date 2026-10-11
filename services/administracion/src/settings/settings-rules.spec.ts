import { canScheduleSettings } from './settings-rules';

describe('canScheduleSettings', () => {
  it('accepts today or a later day, never an earlier one', () => {
    expect(canScheduleSettings('2026-10-10', '2026-10-10')).toBe(true);
    expect(canScheduleSettings('2026-11-01', '2026-10-10')).toBe(true);
    expect(canScheduleSettings('2026-10-09', '2026-10-10')).toBe(false);
  });
});
