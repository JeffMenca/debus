import {
  branchFieldsSchema,
  createRouteRequestSchema,
  driverFieldsSchema,
  isInsideGuatemala,
  plateSchema,
} from '@debus/contracts';
import {
  EXPENSE_CATEGORIES,
  SEED_BRANCHES,
  SEED_ROUTES,
  adminEmail,
  branchFields,
  busesFor,
  cashierEmail,
  driversFor,
  repairPlans,
  repairsFor,
  routesFrom,
} from './catalog';

const BASE = 'seed@debus.local';
const TODAY = '2026-10-19';
const codes = SEED_BRANCHES.map((branch) => branch.code);

describe('seed catalog', () => {
  it('has the six real branches', () => {
    expect(codes).toEqual(['GUA', 'XEL', 'ANT', 'COB', 'HUE', 'FLO']);
  });

  it.each(SEED_BRANCHES)('branch $code is valid and inside Guatemala', (branch) => {
    expect(branchFieldsSchema.safeParse(branchFields(branch)).success).toBe(true);
    expect(branchFields(branch)).not.toHaveProperty('adminName');
    expect(isInsideGuatemala(branch.latitude, branch.longitude)).toBe(true);
    expect(branch.adminName.length).toBeGreaterThan(1);
    expect(branch.cashierName.length).toBeGreaterThan(1);
  });

  it('does not repeat a branch name', () => {
    expect(new Set(SEED_BRANCHES.map((branch) => branch.name)).size).toBe(SEED_BRANCHES.length);
  });

  describe('buses', () => {
    const plates = codes.flatMap((code) => busesFor(code).map((bus) => bus.plate));

    it('gives every branch buses with valid plates that never repeat', () => {
      for (const code of codes) expect(busesFor(code).length).toBeGreaterThanOrEqual(2);
      for (const plate of plates) expect(plateSchema.safeParse(plate).success).toBe(true);
      expect(new Set(plates).size).toBe(plates.length);
    });

    it('has at least one bus per route that leaves a branch', () => {
      for (const code of codes) {
        expect(busesFor(code).length).toBeGreaterThanOrEqual(routesFrom(code).length > 2 ? 3 : 1);
      }
    });

    it('gives every bus a regular driver', () => {
      for (const code of codes) {
        const drivers = driversFor(code, TODAY, BASE);
        for (const bus of busesFor(code))
          expect(bus.driverNumber).toBeLessThanOrEqual(drivers.length);
        expect(drivers).toHaveLength(busesFor(code).length);
      }
    });
  });

  describe('drivers', () => {
    it.each(codes)('the drivers of %s are valid and tagged with the branch', (code) => {
      const drivers = driversFor(code, TODAY, BASE);
      drivers.forEach((driver, position) => {
        expect(driverFieldsSchema.safeParse(driver).success).toBe(true);
        expect(driver.email).toBe(`seed+chofer-${code.toLowerCase()}-${position + 1}@debus.local`);
      });
    });

    it('does not repeat an email or a licence', () => {
      const all = codes.flatMap((code) => driversFor(code, TODAY, BASE));
      expect(new Set(all.map((driver) => driver.email)).size).toBe(all.length);
      expect(new Set(all.map((driver) => driver.licenseNumber)).size).toBe(all.length);
    });

    it('lets at least two licences expire in 10 to 30 days and the rest later', () => {
      const all = codes.flatMap((code) => driversFor(code, TODAY, BASE));
      const days = all.map(
        (driver) => (Date.parse(driver.licenseExpiresOn) - Date.parse(TODAY)) / 86_400_000,
      );
      expect(days.filter((value) => value >= 10 && value <= 30).length).toBeGreaterThanOrEqual(2);
      expect(days.filter((value) => value > 30).length).toBe(
        days.length - days.filter((v) => v <= 30).length,
      );
      expect(Math.min(...days)).toBeGreaterThanOrEqual(10);
    });
  });

  describe('routes', () => {
    const idOf = (code: string) =>
      `00000000-0000-4000-8000-${String(codes.indexOf(code) + 1).padStart(12, '0')}`;

    it('joins two catalog branches with a request the API accepts', () => {
      for (const route of SEED_ROUTES) {
        expect(codes).toContain(route.from);
        expect(codes).toContain(route.to);
        expect(route.from).not.toBe(route.to);
        const request = {
          destinationBranchId: idOf(route.to),
          distanceKm: route.distanceKm,
          ticketPrice: route.ticketPrice,
        };
        expect(createRouteRequestSchema.safeParse(request).success).toBe(true);
      }
    });

    it('has a way back for every route and a route out of every branch', () => {
      for (const route of SEED_ROUTES) {
        expect(SEED_ROUTES.some((back) => back.from === route.to && back.to === route.from)).toBe(
          true,
        );
      }
      for (const code of codes) expect(routesFrom(code).length).toBeGreaterThan(0);
    });

    it('does not repeat a pair', () => {
      const pairs = SEED_ROUTES.map((route) => `${route.from}>${route.to}`);
      expect(new Set(pairs).size).toBe(pairs.length);
    });
  });

  describe('repairs', () => {
    it('only uses the categories the migration seeds, with two different ones per repair', () => {
      for (const plan of repairPlans) {
        const [first, second] = plan.lines;
        expect(EXPENSE_CATEGORIES).toContain(first.category);
        expect(EXPENSE_CATEGORIES).toContain(second.category);
        expect(first.category).not.toBe(second.category);
        expect(plan.daysAgo).toBeGreaterThanOrEqual(10);
        expect(plan.daysAgo).toBeLessThanOrEqual(60);
      }
    });

    it('plans one or two repairs per bus', () => {
      for (let bus = 0; bus < 6; bus++) {
        expect([1, 2]).toContain(repairsFor(bus).length);
      }
      const [first, second] = repairsFor(1);
      expect(first).not.toBe(second);
    });
  });

  it('does not know a branch that is not in the catalog', () => {
    expect(() => busesFor('ZZZ')).toThrow('Unknown seed branch ZZZ');
    expect(() => driversFor('ZZZ', TODAY, BASE)).toThrow('Unknown seed branch ZZZ');
  });

  it('tags the staff accounts with the branch code', () => {
    expect(adminEmail(BASE, 'XEL')).toBe('seed+admin-xel@debus.local');
    expect(cashierEmail(BASE, 'XEL')).toBe('seed+cajero-xel@debus.local');
  });
});
