import {
  busDisplayStatus,
  canAssignDriver,
  displayStatusWhere,
  hasPendingTrips,
  toStatusCounts,
} from './bus-rules';

const bus = { active: true, inTransit: false, operationalStatus: 'AVAILABLE' as const };

describe('bus rules', () => {
  it('shows inactive first, then on the road, then the workshop', () => {
    expect(busDisplayStatus({ ...bus, active: false, inTransit: true })).toBe('INACTIVE');
    expect(busDisplayStatus({ ...bus, inTransit: true, operationalStatus: 'IN_WORKSHOP' })).toBe(
      'IN_TRANSIT',
    );
    expect(busDisplayStatus({ ...bus, operationalStatus: 'IN_WORKSHOP' })).toBe('IN_WORKSHOP');
    expect(busDisplayStatus(bus)).toBe('AVAILABLE');
  });

  it('filters each status with the same precedence', () => {
    expect(displayStatusWhere('INACTIVE')).toEqual({ active: false });
    expect(displayStatusWhere('IN_TRANSIT')).toEqual({ active: true, inTransit: true });
    expect(displayStatusWhere('IN_WORKSHOP')).toEqual({
      active: true,
      inTransit: false,
      operationalStatus: 'IN_WORKSHOP',
    });
    expect(displayStatusWhere('AVAILABLE')).toEqual({
      active: true,
      inTransit: false,
      operationalStatus: 'AVAILABLE',
    });
  });

  it('adds the grouped rows into one count per status', () => {
    expect(
      toStatusCounts([
        { active: true, inTransit: true, operationalStatus: 'AVAILABLE', _count: { _all: 2 } },
        { active: true, inTransit: false, operationalStatus: 'IN_WORKSHOP', _count: { _all: 1 } },
        { active: false, inTransit: false, operationalStatus: 'AVAILABLE', _count: { _all: 3 } },
        { active: false, inTransit: false, operationalStatus: 'IN_WORKSHOP', _count: { _all: 1 } },
      ]),
    ).toEqual({ IN_TRANSIT: 2, AVAILABLE: 0, IN_WORKSHOP: 1, INACTIVE: 4 });
  });

  it('ignores a grouped row that has no count', () => {
    expect(toStatusCounts([{ ...bus, _count: true }, { ...bus }])).toEqual({
      IN_TRANSIT: 0,
      AVAILABLE: 0,
      IN_WORKSHOP: 0,
      INACTIVE: 0,
    });
  });

  it('blocks deactivation while a trip is scheduled or on the road', () => {
    expect(hasPendingTrips([{ status: 'COMPLETED' }])).toBe(false);
    expect(hasPendingTrips([{ status: 'SCHEDULED' }])).toBe(true);
    expect(hasPendingTrips([{ status: 'IN_TRANSIT' }])).toBe(true);
  });

  it('assigns only an active driver of the same branch', () => {
    expect(canAssignDriver({ branchId: 'b' }, { branchId: 'b', active: true })).toBe(true);
    expect(canAssignDriver({ branchId: 'b' }, { branchId: 'x', active: true })).toBe(false);
    expect(canAssignDriver({ branchId: 'b' }, { branchId: 'b', active: false })).toBe(false);
  });
});
