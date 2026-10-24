import {
  incomeOf,
  expensesOf,
  marginOf,
  profitOf,
  toProfitRow,
  toProfitTotals,
} from './system-profit.rows';

describe('system profit rows', () => {
  const record = {
    branch_id: '9b2c7a10-1111-4c4c-8888-123456789abc',
    branch_name: 'Quetzaltenango',
    ticket_income: 255,
    rental_income: 2760,
    fuel: 1180,
    labor: 350.5,
    parts: 5200,
    depreciation: 306,
  };

  it('subtracts the expenses from the income without floating point noise', () => {
    expect(profitOf(3015, 7036.5)).toBe(-4021.5);
    expect(profitOf(0.3, 0.1)).toBe(0.2);
    expect(profitOf(100, 100)).toBe(0);
  });

  it('sums the income and the expenses to the cent', () => {
    expect(incomeOf(0.1, 0.2)).toBe(0.3);
    expect(expensesOf({ fuel: 0.1, labor: 0.2, parts: 0.4, depreciation: 0.3 })).toBe(1);
  });

  it('gives the margin as a percentage of the income with one decimal', () => {
    expect(marginOf(850, 50)).toBe(5.9);
    expect(marginOf(3015, -4021.5)).toBe(-133.4);
    expect(marginOf(100, 100)).toBe(100);
  });

  it('has no margin when there is no income, even with a loss', () => {
    expect(marginOf(0, 0)).toBeNull();
    expect(marginOf(0, -120)).toBeNull();
  });

  it('maps a raw branch to the contract row with the figures derived from its parts', () => {
    expect(toProfitRow(record)).toEqual({
      branchId: record.branch_id,
      branchName: 'Quetzaltenango',
      ticketIncome: 255,
      rentalIncome: 2760,
      income: 3015,
      fuel: 1180,
      labor: 350.5,
      parts: 5200,
      depreciation: 306,
      expenses: 7036.5,
      profit: -4021.5,
      margin: -133.4,
    });
  });

  it('keeps a branch with no movement at zero and without a margin', () => {
    expect(
      toProfitRow({
        ...record,
        ticket_income: 0,
        rental_income: 0,
        fuel: 0,
        labor: 0,
        parts: 0,
        depreciation: 0,
      }),
    ).toMatchObject({ income: 0, expenses: 0, profit: 0, margin: null });
  });

  it('adds the totals from the same parts and turns them into zeros when nothing matched', () => {
    expect(toProfitTotals(undefined)).toEqual({
      ticketIncome: 0,
      rentalIncome: 0,
      income: 0,
      fuel: 0,
      labor: 0,
      parts: 0,
      depreciation: 0,
      expenses: 0,
      profit: 0,
      margin: null,
    });
    expect(toProfitTotals({ ...record, branches: 1 })).toMatchObject({
      income: 3015,
      expenses: 7036.5,
      profit: -4021.5,
      margin: -133.4,
    });
  });
});
