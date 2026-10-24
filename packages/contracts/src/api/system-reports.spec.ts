import { randomUUID } from 'node:crypto';
import { EXAMPLE_IDS } from '../events/fleet-examples';
import {
  EXPENSE_CONCEPTS,
  INCOME_CONCEPTS,
  SYSTEM_REPORTS,
  systemBusOptionRowSchema,
  systemBusOptionsPageSchema,
  systemBusOptionsQuerySchema,
  systemExpenseRowSchema,
  systemExpensesPageSchema,
  systemExpensesQuerySchema,
  systemIncomePageSchema,
  systemIncomeQuerySchema,
  systemIncomeRowSchema,
  systemProfitPageSchema,
  systemProfitQuerySchema,
  systemProfitRowSchema,
  systemRepairExpenseRowSchema,
  systemRepairExpensesPageSchema,
  systemRepairExpensesQuerySchema,
  systemRoutesMapQuerySchema,
  systemRoutesMapSchema,
  systemTopRouteRowSchema,
  systemTopRoutesPageSchema,
  systemTopRoutesQuerySchema,
} from './system-reports';

const page = { total: 1, page: 1, pageSize: 20 };

const rangedQueries = [
  ['income', systemIncomeQuerySchema],
  ['expenses', systemExpensesQuerySchema],
  ['profit', systemProfitQuerySchema],
  ['top routes', systemTopRoutesQuerySchema],
  ['repair expenses', systemRepairExpensesQuerySchema],
] as const;

describe('system report queries', () => {
  it('lists the six reports of the system administrator', () => {
    expect(SYSTEM_REPORTS).toEqual([
      'system-income',
      'system-expenses',
      'system-profit',
      'system-top-routes',
      'system-repair-expenses',
      'system-routes-map',
    ]);
  });

  it('closes the income and expense concepts', () => {
    expect(INCOME_CONCEPTS).toEqual(['ONLINE_TICKET', 'COUNTER_TICKET', 'RENTAL']);
    expect(EXPENSE_CONCEPTS).toEqual(['FUEL', 'DEPRECIATION', 'LABOR', 'PART']);
  });

  it.each(rangedQueries)('refuses a %s range that goes backwards', (_name, schema) => {
    expect(schema.safeParse({ from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
  });

  it.each(rangedQueries)('accepts an empty %s range as every record', (_name, schema) => {
    expect(schema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(schema.parse({ from: '2026-10-01' })).toMatchObject({ from: '2026-10-01' });
    expect(schema.parse({ from: '2026-10-01', to: '2026-10-01' }).to).toBe('2026-10-01');
  });

  it.each(rangedQueries)('filters %s by one branch', (_name, schema) => {
    expect(schema.parse({ branchId: EXAMPLE_IDS.branch })).toMatchObject({
      branchId: EXAMPLE_IDS.branch,
    });
    expect(schema.safeParse({ branchId: 'not-an-id' }).success).toBe(false);
  });

  it('filters the repair report by bus too', () => {
    expect(systemRepairExpensesQuerySchema.parse({ busId: EXAMPLE_IDS.bus }).busId).toBe(
      EXAMPLE_IDS.bus,
    );
    expect(systemRepairExpensesQuerySchema.safeParse({ busId: 'x' }).success).toBe(false);
  });

  it('reads the map query with an optional branch and no paging', () => {
    expect(systemRoutesMapQuerySchema.parse({})).toEqual({});
    expect(systemRoutesMapQuerySchema.parse({ branchId: EXAMPLE_IDS.branch }).branchId).toBe(
      EXAMPLE_IDS.branch,
    );
    expect(systemRoutesMapQuerySchema.safeParse({ branchId: 'x' }).success).toBe(false);
  });

  it('reads the bus options query with a folded search and paging', () => {
    expect(systemBusOptionsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(systemBusOptionsQuerySchema.parse({ q: 'Volvó', pageSize: '100' })).toMatchObject({
      q: 'volvo',
      pageSize: 100,
    });
    expect(systemBusOptionsQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('system report rows', () => {
  const branch = { branchId: randomUUID(), branchName: 'Quetzaltenango' };

  it('accepts an income row and a page with totals and branch groups', () => {
    const row = {
      id: randomUUID(),
      ...branch,
      concept: 'ONLINE_TICKET',
      day: '2026-10-20',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      clientName: null,
      quantity: 2,
      amount: 170,
    };

    expect(systemIncomeRowSchema.parse(row).concept).toBe('ONLINE_TICKET');
    expect(systemIncomeRowSchema.safeParse({ ...row, concept: 'GIFT' }).success).toBe(false);
    expect(systemIncomeRowSchema.safeParse({ ...row, amount: -1 }).success).toBe(false);
    expect(
      systemIncomePageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { entries: 1, amount: 170, onlineTickets: 170, counterTickets: 0, rentals: 0 },
          groups: [{ ...branch, entries: 1, amount: 170 }],
        },
      }).summary.groups,
    ).toHaveLength(1);
  });

  it('accepts an expense row for a trip and one for a repair line', () => {
    const base = {
      ...branch,
      day: '2026-10-20',
      busPlate: null,
      originLabel: null,
      destinationLabel: null,
      categoryName: null,
      description: null,
    };
    const fuel = { ...base, id: `${randomUUID()}:FUEL`, concept: 'FUEL', amount: 1180 };
    const labor = {
      ...base,
      id: `${randomUUID()}:1`,
      concept: 'LABOR',
      categoryName: 'Llantas',
      description: 'Cambio',
      amount: 350.5,
    };

    expect(systemExpenseRowSchema.parse(fuel).concept).toBe('FUEL');
    expect(systemExpenseRowSchema.parse(labor).categoryName).toBe('Llantas');
    expect(systemExpenseRowSchema.safeParse({ ...fuel, concept: 'SALARY' }).success).toBe(false);
    expect(
      systemExpensesPageSchema.parse({
        items: [fuel, labor],
        ...page,
        summary: {
          totals: {
            entries: 2,
            amount: 1530.5,
            fuel: 1180,
            depreciation: 0,
            labor: 350.5,
            parts: 0,
          },
          groups: [{ ...branch, entries: 2, amount: 1530.5 }],
        },
      }).summary.totals.amount,
    ).toBe(1530.5);
  });

  it('accepts a profit row with a negative profit and no margin', () => {
    const row = {
      ...branch,
      ticketIncome: 0,
      rentalIncome: 0,
      income: 0,
      fuel: 100,
      labor: 0,
      parts: 0,
      depreciation: 20,
      expenses: 120,
      profit: -120,
      margin: null,
    };

    expect(systemProfitRowSchema.parse(row)).toMatchObject({ profit: -120, margin: null });
    expect(systemProfitRowSchema.parse({ ...row, margin: 42.5 }).margin).toBe(42.5);
    expect(systemProfitRowSchema.safeParse({ ...row, expenses: -1 }).success).toBe(false);
    const sums = { ...row, branchId: undefined, branchName: undefined };
    expect(
      systemProfitPageSchema.parse({
        items: [row],
        ...page,
        summary: { totals: sums, groups: [] },
      }).summary.totals.profit,
    ).toBe(-120);
  });

  it('accepts a top route row whose route has not arrived yet', () => {
    const row = {
      position: 1,
      routeId: randomUUID(),
      branchId: randomUUID(),
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Guatemala',
      distanceKm: null,
      ticketPrice: null,
      active: null,
      trips: 2,
      onlineTickets: 3,
      counterTickets: 1,
      tickets: 4,
      income: 340,
      share: 100,
    };

    expect(systemTopRouteRowSchema.parse(row).distanceKm).toBeNull();
    expect(systemTopRouteRowSchema.parse({ ...row, distanceKm: 201.5, active: true }).active).toBe(
      true,
    );
    expect(systemTopRouteRowSchema.safeParse({ ...row, position: 0 }).success).toBe(false);
    expect(
      systemTopRoutesPageSchema.parse({
        items: [row],
        ...page,
        summary: { totals: { routes: 1, trips: 2, tickets: 4, income: 340 }, groups: [] },
      }).summary.totals.tickets,
    ).toBe(4);
  });

  it('accepts a repair line row and a page with category groups', () => {
    const row = {
      expenseId: randomUUID(),
      lineNo: 1,
      categoryId: randomUUID(),
      categoryName: 'Llantas',
      busId: randomUUID(),
      busPlate: null,
      ...branch,
      serviceDate: '2026-10-20',
      kind: 'PART',
      description: 'Llanta 295/80',
      amount: 5200,
    };

    expect(systemRepairExpenseRowSchema.parse(row).kind).toBe('PART');
    expect(systemRepairExpenseRowSchema.parse({ ...row, lineNo: 0 }).lineNo).toBe(0);
    expect(systemRepairExpenseRowSchema.safeParse({ ...row, lineNo: -1 }).success).toBe(false);
    expect(systemRepairExpenseRowSchema.safeParse({ ...row, kind: 'TAX' }).success).toBe(false);
    expect(
      systemRepairExpensesPageSchema.parse({
        items: [row],
        ...page,
        summary: {
          totals: { lines: 1, expenses: 1, amount: 5200 },
          groups: [{ categoryId: row.categoryId, categoryName: 'Llantas', lines: 1, amount: 5200 }],
        },
      }).summary.groups,
    ).toHaveLength(1);
  });

  it('accepts a bus option row and a page of options', () => {
    const row = {
      id: randomUUID(),
      plate: 'C482BTX',
      brand: 'Volvo',
      model: 'B8R',
      branchName: 'Quetzaltenango',
    };

    expect(systemBusOptionRowSchema.parse(row).plate).toBe('C482BTX');
    expect(
      systemBusOptionsPageSchema.parse({
        items: [row],
        ...page,
        summary: { totals: { buses: 1 }, groups: [] },
      }).total,
    ).toBe(1);
  });

  it('accepts a map with the selected branch, its routes and the other branches', () => {
    const destination = {
      routeId: randomUUID(),
      destinationBranchId: randomUUID(),
      destinationName: 'Guatemala',
      latitude: 14.6349,
      longitude: -90.5069,
      distanceKm: 201.5,
      ticketPrice: 85,
      tickets: 0,
    };
    const map = {
      branches: [
        {
          id: randomUUID(),
          name: 'Quetzaltenango',
          latitude: 14.8347,
          longitude: -91.5181,
          routes: 1,
        },
      ],
      selectedBranchId: randomUUID(),
      routes: [destination],
    };

    expect(systemRoutesMapSchema.parse(map).routes).toHaveLength(1);
    expect(
      systemRoutesMapSchema.parse({ branches: [], selectedBranchId: null, routes: [] }),
    ).toEqual({ branches: [], selectedBranchId: null, routes: [] });
    expect(
      systemRoutesMapSchema.safeParse({ ...map, routes: [{ ...destination, latitude: 120 }] })
        .success,
    ).toBe(false);
  });
});
