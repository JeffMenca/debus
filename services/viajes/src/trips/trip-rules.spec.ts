import { availabilityProblem, branchesProblem, scheduleProblem } from './trip-rules';

const now = new Date('2026-10-15T12:00:00Z');
const route = { originBranchId: 'b', active: true, deleted: false };
const bus = { active: true };
const driver = { active: true };
const ok = {
  branchId: 'b',
  route,
  bus,
  driver,
  departureAt: '2026-10-16T12:00:00.000Z',
  now,
};

describe('scheduleProblem', () => {
  it('accepts a future trip on an active route of the branch and hands back what it checked', () => {
    expect(scheduleProblem(ok)).toEqual({ ok: true, route, bus, driver });
  });

  it('names the first thing that is wrong', () => {
    const problem = (over: Record<string, unknown>) => scheduleProblem({ ...ok, ...over });

    expect(problem({ route: null })).toEqual({ ok: false, problem: 'routeNotFound' });
    expect(problem({ route: { ...route, originBranchId: 'x' } })).toEqual({
      ok: false,
      problem: 'routeNotFound',
    });
    expect(problem({ route: { ...route, originBranchId: null } })).toEqual({
      ok: false,
      problem: 'routeNotFound',
    });
    expect(problem({ route: { ...route, deleted: true } })).toEqual({
      ok: false,
      problem: 'routeNotFound',
    });
    expect(problem({ route: { ...route, active: false } })).toEqual({
      ok: false,
      problem: 'routeRetired',
    });
    expect(problem({ bus: null })).toEqual({ ok: false, problem: 'busPending' });
    expect(problem({ driver: null })).toEqual({ ok: false, problem: 'driverPending' });
    // The local copy is checked again, so a bus deactivated a moment ago is refused even if flota answered before.
    expect(problem({ bus: { active: false } })).toEqual({ ok: false, problem: 'busInactive' });
    expect(problem({ driver: { active: false } })).toEqual({
      ok: false,
      problem: 'driverInactive',
    });
    expect(problem({ departureAt: '2026-10-15T11:59:00.000Z' })).toEqual({
      ok: false,
      problem: 'departureInPast',
    });
    expect(problem({ departureAt: now.toISOString() })).toEqual({
      ok: false,
      problem: 'departureInPast',
    });
  });

  it('puts the route before the bus, the bus before the driver and the clock last', () => {
    const everythingWrong = {
      ...ok,
      route: { ...route, active: false },
      bus: null,
      driver: null,
      departureAt: '2020-01-01T00:00:00.000Z',
    };

    expect(scheduleProblem(everythingWrong)).toEqual({ ok: false, problem: 'routeRetired' });
    expect(scheduleProblem({ ...everythingWrong, route })).toEqual({
      ok: false,
      problem: 'busPending',
    });
    expect(scheduleProblem({ ...everythingWrong, route, bus })).toEqual({
      ok: false,
      problem: 'driverPending',
    });
    expect(scheduleProblem({ ...everythingWrong, route, bus, driver })).toEqual({
      ok: false,
      problem: 'departureInPast',
    });
  });
});

describe('availabilityProblem', () => {
  it('reports the bus before the driver', () => {
    expect(
      availabilityProblem({
        bus: { available: false, reason: 'IN_WORKSHOP' },
        driver: { available: false, reason: 'BUSY' },
      }),
    ).toBe('busInWorkshop');
    expect(
      availabilityProblem({
        bus: { available: true },
        driver: { available: false, reason: 'LICENSE_EXPIRED' },
      }),
    ).toBe('driverLicenseExpired');
    expect(
      availabilityProblem({ bus: { available: true }, driver: { available: true } }),
    ).toBeNull();
  });

  it('turns every reason of the bus and of the driver into its own text', () => {
    const bus = (reason: 'NOT_FOUND' | 'OTHER_BRANCH' | 'INACTIVE' | 'BUSY' | 'LICENSE_EXPIRED') =>
      availabilityProblem({
        bus: { available: false, reason },
        driver: { available: true },
      });
    const driver = (reason: 'NOT_FOUND' | 'OTHER_BRANCH' | 'INACTIVE' | 'BUSY' | 'IN_WORKSHOP') =>
      availabilityProblem({
        bus: { available: true },
        driver: { available: false, reason },
      });

    expect(bus('NOT_FOUND')).toBe('busNotFound');
    expect(bus('OTHER_BRANCH')).toBe('busNotFound');
    expect(bus('INACTIVE')).toBe('busInactive');
    expect(bus('BUSY')).toBe('busBusy');
    expect(bus('LICENSE_EXPIRED')).toBe('busNotFound');
    expect(driver('NOT_FOUND')).toBe('driverNotFound');
    expect(driver('OTHER_BRANCH')).toBe('driverNotFound');
    expect(driver('INACTIVE')).toBe('driverInactive');
    expect(driver('BUSY')).toBe('driverBusy');
    expect(driver('IN_WORKSHOP')).toBe('driverNotFound');
  });

  it('reads an answer without a reason as not found', () => {
    expect(availabilityProblem({ bus: { available: false }, driver: { available: true } })).toBe(
      'busNotFound',
    );
    expect(availabilityProblem({ bus: { available: true }, driver: { available: false } })).toBe(
      'driverNotFound',
    );
  });
});

describe('branchesProblem', () => {
  it('accepts a trip between two active branches', () => {
    expect(branchesProblem({ active: true }, { active: true })).toBeNull();
  });

  it('refuses a branch that was deactivated, at either end', () => {
    expect(branchesProblem({ active: false }, { active: true })).toBe('branchInactive');
    expect(branchesProblem({ active: true }, { active: false })).toBe('destinationInactive');
  });

  it('refuses a branch whose copy has not arrived', () => {
    expect(branchesProblem(null, { active: true })).toBe('routeNotFound');
    expect(branchesProblem({ active: true }, null)).toBe('routeNotFound');
  });
});
