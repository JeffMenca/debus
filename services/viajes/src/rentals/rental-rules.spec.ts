import { assignmentProblem } from './rental-rules';

const request = {
  status: 'PENDING' as const,
  passengers: 35,
  departureAt: new Date('2026-10-24T13:00:00.000Z'),
  returnAt: null as Date | null,
};
const bus = { active: true, capacity: 40, branchId: 'b' };
const driver = { active: true, branchId: 'b' };
const ok = {
  request,
  bus,
  driver,
  branchId: 'b',
  estimatedArrivalAt: '2026-10-24T23:00:00.000Z',
  now: new Date('2026-10-20T12:00:00.000Z'),
};

describe('assignmentProblem', () => {
  it.each([
    [{ request: null }, 'rentalNotFound'],
    [{ request: { ...request, status: 'ASSIGNED' as const } }, 'rentalAssigned'],
    [{ bus: null }, 'busNotFound'],
    [{ bus: { ...bus, branchId: 'otra' } }, 'busNotFound'],
    [{ bus: { ...bus, active: false } }, 'busInactive'],
    [{ bus: { ...bus, capacity: 30 } }, 'rentalBusTooSmall'],
    [{ driver: null }, 'driverNotFound'],
    [{ driver: { ...driver, branchId: 'otra' } }, 'driverNotFound'],
    [{ driver: { ...driver, active: false } }, 'driverInactive'],
    [{ estimatedArrivalAt: '2026-10-24T12:00:00.000Z' }, 'rentalArrivalBeforeDeparture'],
    [{ estimatedArrivalAt: '2026-10-24T13:00:00.000Z' }, 'rentalArrivalBeforeDeparture'],
    [
      {
        request: { ...request, departureAt: new Date('2026-10-19T08:00:00.000Z') },
        estimatedArrivalAt: '2026-10-20T11:59:00.000Z',
      },
      'rentalArrivalInPast',
    ],
    [
      { request: { ...request, returnAt: new Date('2026-10-25T08:00:00.000Z') } },
      'rentalArrivalBeforeReturn',
    ],
  ])('refuses %o with %s', (change, problem) => {
    expect(assignmentProblem({ ...ok, ...change })).toBe(problem);
  });

  it('still assigns a rental whose departure passed, while its arrival is ahead', () => {
    const late = { ...request, departureAt: new Date('2026-10-20T10:00:00.000Z') };

    expect(assignmentProblem({ ...ok, request: late })).toBeNull();
  });

  it('accepts an arrival that is exactly the return of a round trip', () => {
    const roundTrip = { ...request, returnAt: new Date('2026-10-24T23:00:00.000Z') };

    expect(assignmentProblem({ ...ok, request: roundTrip })).toBeNull();
  });

  it('accepts a pending rental with a big enough bus', () => {
    expect(assignmentProblem(ok)).toBeNull();
  });

  it('accepts a bus with exactly as many seats as passengers', () => {
    expect(assignmentProblem({ ...ok, bus: { ...bus, capacity: 35 } })).toBeNull();
  });
});
