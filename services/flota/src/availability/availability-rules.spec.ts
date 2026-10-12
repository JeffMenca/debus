import { busVerdict, driverVerdict, overlaps } from './availability-rules';

const bus = { branchId: 'b', active: true, operationalStatus: 'AVAILABLE' as const };
const driver = {
  branchId: 'b',
  active: true,
  licenseExpiresOn: new Date('2026-10-20T00:00:00.000Z'),
};

describe('availability', () => {
  it('explains why a bus cannot go', () => {
    expect(busVerdict(null, 'b', false)).toEqual({ available: false, reason: 'NOT_FOUND' });
    expect(busVerdict({ ...bus, branchId: 'x' }, 'b', false)).toEqual({
      available: false,
      reason: 'OTHER_BRANCH',
    });
    expect(busVerdict({ ...bus, active: false }, 'b', false)).toEqual({
      available: false,
      reason: 'INACTIVE',
    });
    expect(busVerdict({ ...bus, operationalStatus: 'IN_WORKSHOP' }, 'b', false)).toEqual({
      available: false,
      reason: 'IN_WORKSHOP',
    });
    expect(busVerdict(bus, 'b', true)).toEqual({ available: false, reason: 'BUSY' });
    expect(busVerdict(bus, 'b', false)).toEqual({ available: true });
  });

  it('explains why a driver cannot go', () => {
    expect(driverVerdict(null, 'b', '2026-10-20', false)).toEqual({
      available: false,
      reason: 'NOT_FOUND',
    });
    expect(driverVerdict({ ...driver, branchId: 'x' }, 'b', '2026-10-20', false)).toEqual({
      available: false,
      reason: 'OTHER_BRANCH',
    });
    expect(driverVerdict({ ...driver, active: false }, 'b', '2026-10-20', false)).toEqual({
      available: false,
      reason: 'INACTIVE',
    });
    expect(driverVerdict(driver, 'b', '2026-10-20', true)).toEqual({
      available: false,
      reason: 'BUSY',
    });
  });

  it('puts the reasons in order: not found, other branch, inactive, workshop or licence, busy', () => {
    const expired = { ...driver, licenseExpiresOn: new Date('2026-01-01T00:00:00.000Z') };

    expect(busVerdict({ ...bus, branchId: 'x', active: false }, 'b', true).reason).toBe(
      'OTHER_BRANCH',
    );
    expect(busVerdict({ ...bus, operationalStatus: 'IN_WORKSHOP' }, 'b', true).reason).toBe(
      'IN_WORKSHOP',
    );
    expect(driverVerdict({ ...expired, active: false }, 'b', '2026-10-20', true).reason).toBe(
      'INACTIVE',
    );
    expect(driverVerdict(expired, 'b', '2026-10-20', true).reason).toBe('LICENSE_EXPIRED');
  });

  it('needs the licence valid on the day of departure', () => {
    expect(driverVerdict(driver, 'b', '2026-10-20', false)).toEqual({ available: true });
    expect(driverVerdict(driver, 'b', '2026-10-21', false)).toEqual({
      available: false,
      reason: 'LICENSE_EXPIRED',
    });
  });

  it('treats touching windows as free and crossing windows as busy', () => {
    const a = {
      departureAt: new Date('2026-10-20T10:00Z'),
      estimatedArrivalAt: new Date('2026-10-20T12:00Z'),
    };
    expect(
      overlaps(a, {
        departureAt: new Date('2026-10-20T12:00Z'),
        estimatedArrivalAt: new Date('2026-10-20T13:00Z'),
      }),
    ).toBe(false);
    expect(
      overlaps(a, {
        departureAt: new Date('2026-10-20T11:59Z'),
        estimatedArrivalAt: new Date('2026-10-20T13:00Z'),
      }),
    ).toBe(true);
    expect(
      overlaps(a, {
        departureAt: new Date('2026-10-20T08:00Z'),
        estimatedArrivalAt: new Date('2026-10-20T10:00Z'),
      }),
    ).toBe(false);
  });
});
