import { randomUUID } from 'node:crypto';
import { EXAMPLE_IDS } from '../events/fleet-examples';
import {
  BRANCH_REPORTS,
  branchBusRowSchema,
  branchBusesPageSchema,
  branchBusesQuerySchema,
  branchDepreciationPageSchema,
  branchDepreciationQuerySchema,
  branchDepreciationRowSchema,
  branchDriverRowSchema,
  branchDriversPageSchema,
  branchDriversQuerySchema,
  branchRentalIncomePageSchema,
  branchRentalIncomeQuerySchema,
  branchRentalIncomeRowSchema,
  branchRepairExpenseRowSchema,
  branchRepairExpensesPageSchema,
  branchRepairExpensesQuerySchema,
  branchTicketIncomePageSchema,
  branchTicketIncomeQuerySchema,
  branchTicketIncomeRowSchema,
} from './branch-reports';

const page = { total: 1, page: 1, pageSize: 20 };

describe('branch report queries', () => {
  it('lists the six reports of the branch administrator', () => {
    expect(BRANCH_REPORTS).toEqual([
      'branch-buses',
      'branch-drivers',
      'branch-ticket-income',
      'branch-rental-income',
      'branch-depreciation',
      'branch-repair-expenses',
    ]);
  });

  it('reads the buses report query with every default', () => {
    expect(branchBusesQuerySchema.parse({})).toEqual({ status: 'all', page: 1, pageSize: 20 });
    expect(branchBusesQuerySchema.parse({ status: 'IN_TRANSIT', q: 'Volvó' }).q).toBe('volvo');
    expect(() => branchBusesQuerySchema.parse({ status: 'BROKEN' })).toThrow();
  });

  it('reads the drivers report query with every default', () => {
    expect(branchDriversQuerySchema.parse({})).toEqual({ status: 'all', page: 1, pageSize: 20 });
    expect(branchDriversQuerySchema.parse({ status: 'inactive', q: 'Núñez' }).q).toBe('nunez');
    expect(() => branchDriversQuerySchema.parse({ status: 'IN_TRANSIT' })).toThrow();
  });

  it('refuses a range that goes backwards', () => {
    expect(() =>
      branchTicketIncomeQuerySchema.parse({ from: '2026-10-10', to: '2026-10-01' }),
    ).toThrow();
    expect(branchTicketIncomeQuerySchema.parse({ routeId: EXAMPLE_IDS.route }).routeId).toBe(
      EXAMPLE_IDS.route,
    );
    expect(branchTicketIncomeQuerySchema.parse({ busId: EXAMPLE_IDS.bus }).busId).toBe(
      EXAMPLE_IDS.bus,
    );
  });

  it('keeps an open range and a search on the rental and depreciation reports', () => {
    expect(branchRentalIncomeQuerySchema.parse({}).page).toBe(1);
    expect(branchRentalIncomeQuerySchema.parse({ q: 'Colegio' }).q).toBe('colegio');
    expect(branchDepreciationQuerySchema.parse({ from: '2026-10-01' }).q).toBeUndefined();
    expect(branchDepreciationQuerySchema.parse({ q: 'Álvarez' }).q).toBe('alvarez');
  });

  it('filters the repair report by bus and category', () => {
    const query = branchRepairExpensesQuerySchema.parse({
      busId: EXAMPLE_IDS.bus,
      categoryId: EXAMPLE_IDS.route,
    });

    expect(query).toMatchObject({ busId: EXAMPLE_IDS.bus, categoryId: EXAMPLE_IDS.route });
    expect(() => branchRepairExpensesQuerySchema.parse({ busId: 'not-an-id' })).toThrow();
  });
});

describe('branch report rows', () => {
  it('accepts a bus row and a page with its totals and status groups', () => {
    const row = {
      busId: randomUUID(),
      plate: 'P123ABC',
      brand: 'Volvo',
      model: 'B12M',
      capacity: 40,
      status: 'IN_TRANSIT',
      driverName: null,
      mileageKm: 1204,
      completedTrips: 3,
    };

    expect(branchBusRowSchema.parse(row).status).toBe('IN_TRANSIT');
    expect(() => branchBusRowSchema.parse({ ...row, status: 'BROKEN' })).toThrow();
    expect(
      branchBusesPageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { buses: 1, completedTrips: 3 },
          groups: [{ status: 'IN_TRANSIT', buses: 1 }],
        },
      }).summary.groups,
    ).toHaveLength(1);
  });

  it('accepts a driver row and a page with active and inactive groups', () => {
    const row = {
      driverId: randomUUID(),
      licenseNumber: 'GT12345',
      fullName: 'José Núñez',
      licenseType: 'A',
      licenseExpiresOn: '2027-03-01',
      active: true,
      completedTrips: 2,
    };

    expect(branchDriverRowSchema.parse(row).licenseType).toBe('A');
    expect(() => branchDriverRowSchema.parse({ ...row, licenseType: 'Z' })).toThrow();
    expect(
      branchDriversPageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { drivers: 1, completedTrips: 2 },
          groups: [{ active: true, drivers: 1 }],
        },
      }).total,
    ).toBe(1);
  });

  it('accepts a ticket income row and its route groups', () => {
    const row = {
      tripId: randomUUID(),
      departureAt: '2026-10-20T11:30:00.000Z',
      routeId: randomUUID(),
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      busId: randomUUID(),
      busPlate: null,
      tickets: 5,
      onlineTickets: 3,
      counterTickets: 2,
      income: 425,
    };

    expect(branchTicketIncomeRowSchema.parse(row).income).toBe(425);
    expect(() => branchTicketIncomeRowSchema.parse({ ...row, income: -1 })).toThrow();
    expect(
      branchTicketIncomePageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { trips: 1, tickets: 5, income: 425 },
          groups: [
            {
              routeId: row.routeId,
              originLabel: 'Quetzaltenango',
              destinationLabel: 'Guatemala',
              tickets: 5,
              income: 425,
            },
          ],
        },
      }).summary.totals.income,
    ).toBe(425);
  });

  it('accepts a rental row that is not assigned a bus yet and a page without groups', () => {
    const row = {
      rentalId: randomUUID(),
      clientName: 'Colegio San José',
      nit: '1234567-8',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: '2026-10-24T13:00:00.000Z',
      returnAt: null,
      paidOn: '2026-10-21',
      passengers: 35,
      busPlate: null,
      price: 2760,
    };

    expect(branchRentalIncomeRowSchema.parse(row).busPlate).toBeNull();
    const body = {
      items: [row],
      ...page,
      summary: { totals: { rentals: 1, income: 2760 }, groups: [] },
    };
    expect(branchRentalIncomePageSchema.parse(body).summary.groups).toEqual([]);
    expect(() =>
      branchRentalIncomePageSchema.parse({
        ...body,
        summary: { ...body.summary, groups: [{}] },
      }),
    ).toThrow();
  });

  it('accepts a depreciation row without a applied amount when the bus has no kilometers', () => {
    const row = {
      busId: randomUUID(),
      plate: 'P123ABC',
      brand: 'Volvo',
      model: 'B12M',
      completedTrips: 0,
      kmTraveled: 0,
      appliedPerKm: null,
      accumulated: 0,
    };

    expect(branchDepreciationRowSchema.parse(row).appliedPerKm).toBeNull();
    expect(
      branchDepreciationPageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { kmTraveled: 0, accumulated: 0, currentPerKm: null },
          groups: [],
        },
      }).summary.totals.currentPerKm,
    ).toBeNull();
  });

  it('accepts a repair report row with its categories', () => {
    const share = (name: string, amount: number) => ({
      categoryId: randomUUID(),
      categoryName: name,
      lines: 1,
      amount,
    });
    const row = {
      busId: randomUUID(),
      plate: 'P123ABC',
      brand: 'Volvo',
      model: 'B12M',
      expenses: 2,
      total: 2000,
      categories: [share('Motor', 1200), share('Llantas', 800)],
    };

    expect(branchRepairExpenseRowSchema.parse(row).categories).toHaveLength(2);
    expect(() => branchRepairExpenseRowSchema.parse({ ...row, total: -1 })).toThrow();
    expect(
      branchRepairExpensesPageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { buses: 1, expenses: 2, total: 2000 },
          groups: row.categories,
        },
      }).summary.groups,
    ).toHaveLength(2);
  });
});
