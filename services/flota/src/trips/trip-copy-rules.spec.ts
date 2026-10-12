import { STATUS_RANK, advancesStatus } from './trip-copy-rules';

describe('trip copy status', () => {
  it('only moves forward, so late or repeated events change nothing', () => {
    expect(advancesStatus(null, 'SCHEDULED')).toBe(true);
    expect(advancesStatus('SCHEDULED', 'IN_TRANSIT')).toBe(true);
    expect(advancesStatus(null, 'COMPLETED')).toBe(true);
    expect(advancesStatus('IN_TRANSIT', 'SCHEDULED')).toBe(false);
    expect(advancesStatus('COMPLETED', 'COMPLETED')).toBe(false);
  });

  it('ranks the statuses in the order a trip lives them', () => {
    expect(STATUS_RANK).toEqual({ SCHEDULED: 1, IN_TRANSIT: 2, COMPLETED: 3 });
  });
});
