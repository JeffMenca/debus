import { expenseProblem, expenseTotals, repairExpenseListWhere } from './expense-rules';

describe('expenseTotals', () => {
  it('adds labour and parts separately and in cents', () => {
    expect(
      expenseTotals([
        { kind: 'PART', amount: 0.1 },
        { kind: 'PART', amount: 0.2 },
        { kind: 'LABOR', amount: 350.5 },
      ]),
    ).toEqual({ total: 350.8, laborTotal: 350.5, partsTotal: 0.3 });
  });

  it('is zero in a kind that has no lines', () => {
    expect(expenseTotals([{ kind: 'PART', amount: 12.34 }])).toEqual({
      total: 12.34,
      laborTotal: 0,
      partsTotal: 12.34,
    });
  });
});

describe('expenseProblem', () => {
  const ok = {
    branchId: 'b',
    bus: { branchId: 'b', active: true },
    categories: [{ id: 'c1', active: true }],
    categoryIds: ['c1', 'c1'],
  };

  it.each([
    [{ bus: null }, 'busNotFound'],
    [{ bus: { branchId: 'otra', active: true } }, 'busNotFound'],
    [{ bus: { branchId: 'b', active: false } }, 'busInactive'],
    [{ categories: [] }, 'categoryNotFound'],
    [{ categories: [{ id: 'c1', active: false }] }, 'categoryInactive'],
  ])('refuses %o with %s', (change, problem) => {
    expect(expenseProblem({ ...ok, ...change })).toBe(problem);
  });

  it('accepts a bus of the branch and active categories, even repeated', () => {
    expect(expenseProblem(ok)).toBeNull();
  });
});

describe('repairExpenseListWhere', () => {
  const base = { page: 1, pageSize: 20 };

  it('always stays inside the branch', () => {
    expect(repairExpenseListWhere('b', base)).toEqual({ branchId: 'b' });
  });

  it('filters by bus, category and the days of the range, both ends included', () => {
    expect(
      repairExpenseListWhere('b', {
        ...base,
        busId: 'bus',
        categoryId: 'cat',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    ).toEqual({
      branchId: 'b',
      busId: 'bus',
      lines: { some: { categoryId: 'cat' } },
      serviceDate: {
        gte: new Date('2026-10-01T00:00:00Z'),
        lte: new Date('2026-10-31T00:00:00Z'),
      },
    });
  });

  it('accepts a range with only one end', () => {
    expect(repairExpenseListWhere('b', { ...base, from: '2026-10-01' })).toEqual({
      branchId: 'b',
      serviceDate: { gte: new Date('2026-10-01T00:00:00Z') },
    });
    expect(repairExpenseListWhere('b', { ...base, to: '2026-10-31' })).toEqual({
      branchId: 'b',
      serviceDate: { lte: new Date('2026-10-31T00:00:00Z') },
    });
  });

  it('searches the plate by its folded text, with % and _ as characters', () => {
    expect(repairExpenseListWhere('b', { ...base, q: 'c48_' })).toEqual({
      branchId: 'b',
      searchText: { contains: 'c48\\_' },
    });
  });
});
