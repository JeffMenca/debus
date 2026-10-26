import type { SystemProfitPage, SystemProfitRow } from '@debus/contracts';

export type ProfitTotals = SystemProfitPage['summary']['totals'];

// The figures a branch adds up to, as the database sums them; everything else is derived here.
interface ProfitParts {
  ticket_income: number;
  rental_income: number;
  fuel: number;
  labor: number;
  parts: number;
  depreciation: number;
}
export interface ProfitRecord extends ProfitParts {
  branch_id: string;
  branch_name: string;
}
export interface ProfitTotalsRecord extends ProfitParts {
  branches: number;
}

// Sums of cents drift in floating point (0.1 + 0.2): every derived figure is rounded back to cents.
const roundMoney = (amount: number): number => Math.round(amount * 100) / 100;

export const incomeOf = (ticketIncome: number, rentalIncome: number): number =>
  roundMoney(ticketIncome + rentalIncome);

export const expensesOf = (parts: {
  fuel: number;
  labor: number;
  parts: number;
  depreciation: number;
}): number => roundMoney(parts.fuel + parts.labor + parts.parts + parts.depreciation);

export const profitOf = (income: number, expenses: number): number => roundMoney(income - expenses);

// A percentage of the income with one decimal; without income there is nothing to measure against.
export const marginOf = (income: number, profit: number): number | null =>
  income === 0 ? null : Math.round((profit / income) * 1000) / 10;

const figuresOf = (record: ProfitParts) => {
  const income = incomeOf(record.ticket_income, record.rental_income);
  const expenses = expensesOf(record);
  const profit = profitOf(income, expenses);
  return {
    ticketIncome: record.ticket_income,
    rentalIncome: record.rental_income,
    income,
    fuel: record.fuel,
    labor: record.labor,
    parts: record.parts,
    depreciation: record.depreciation,
    expenses,
    profit,
    margin: marginOf(income, profit),
  };
};

export const toProfitRow = (record: ProfitRecord): SystemProfitRow => ({
  branchId: record.branch_id,
  branchName: record.branch_name,
  ...figuresOf(record),
});

export const toProfitTotals = (record: ProfitTotalsRecord | undefined): ProfitTotals =>
  figuresOf(
    record ?? {
      ticket_income: 0,
      rental_income: 0,
      fuel: 0,
      labor: 0,
      parts: 0,
      depreciation: 0,
    },
  );
