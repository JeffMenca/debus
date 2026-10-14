import { createRepairExpenseRequestSchema } from '@debus/contracts';
import {
  EXPENSE_PROBLEMS,
  type ExpenseValues,
  emptyLine,
  liveTotals,
  toCreateRepairExpenseRequest,
  validateExpense,
} from './expense-form';

const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const MOTOR = '1b2c3d4e-5f60-4a71-8b82-93a4b5c6d7e8';
const TIRES = '2c3d4e5f-6071-4b82-9c93-a4b5c6d7e8f9';
const EXPENSE_ID = '3d4e5f60-7182-4c93-8da4-b5c6d7e8f9a0';

const line = (over: Partial<ExpenseValues['lines'][number]> = {}) => ({
  ...emptyLine('k'),
  categoryId: MOTOR,
  amount: '1200',
  ...over,
});
const values = (over: Partial<ExpenseValues> = {}): ExpenseValues => ({
  busId: BUS_ID,
  serviceDate: '2026-10-20',
  lines: [line()],
  ...over,
});

describe('toCreateRepairExpenseRequest', () => {
  it.each([
    ['5,200.00', 5200],
    ['5200', 5200],
    ['350.5', 350.5],
  ])('turns the amount %s into %d', (amount, expected) => {
    const request = toCreateRepairExpenseRequest(values({ lines: [line({ amount })] }), EXPENSE_ID);

    expect(request.lines[0]?.amount).toBe(expected);
  });

  it('keeps the id it is given, so a retry sends the same expense', () => {
    expect(toCreateRepairExpenseRequest(values(), EXPENSE_ID).id).toBe(EXPENSE_ID);
  });

  it('drops the lines left completely empty and trims the descriptions', () => {
    const request = toCreateRepairExpenseRequest(
      values({
        lines: [
          line({ description: '  Cambio de bomba  ' }),
          emptyLine('blank'),
          line({ categoryId: TIRES, kind: 'PART', amount: '4,000.00' }),
        ],
      }),
      EXPENSE_ID,
    );

    expect(request.lines).toEqual([
      { categoryId: MOTOR, kind: 'LABOR', description: 'Cambio de bomba', amount: 1200 },
      { categoryId: TIRES, kind: 'PART', description: '', amount: 4000 },
    ]);
  });

  it('builds what the service validates', () => {
    expect(
      createRepairExpenseRequestSchema.safeParse(toCreateRepairExpenseRequest(values(), EXPENSE_ID))
        .success,
    ).toBe(true);
  });
});

describe('liveTotals', () => {
  it('adds labour and parts separately and in cents', () => {
    expect(
      liveTotals([
        line({ kind: 'PART', amount: '0.10' }),
        line({ kind: 'PART', amount: '0.20' }),
        line({ kind: 'LABOR', amount: '350.5' }),
      ]),
    ).toEqual({ total: 350.8, laborTotal: 350.5, partsTotal: 0.3 });
  });

  it('ignores the lines that are empty or still being typed', () => {
    expect(liveTotals([emptyLine('a'), line({ amount: '12x' }), line({ amount: '' })])).toEqual({
      total: 0,
      laborTotal: 0,
      partsTotal: 0,
    });
  });
});

describe('validateExpense', () => {
  it('accepts a bus, a date and a line with category and amount', () => {
    expect(validateExpense(values())).toBeNull();
  });

  it('accepts empty lines next to a good one, because they are dropped', () => {
    expect(validateExpense(values({ lines: [line(), emptyLine('blank')] }))).toBeNull();
  });

  it('asks for the bus and the date', () => {
    expect(validateExpense(values({ busId: '', serviceDate: '' }))).toEqual({
      busId: EXPENSE_PROBLEMS.busId,
      serviceDate: EXPENSE_PROBLEMS.serviceDate,
      lines: {},
    });
  });

  it('marks the category and the amount of each line that misses them', () => {
    expect(
      validateExpense(
        values({
          lines: [line({ categoryId: '' }), line({ amount: '0' }), line({ amount: 'abc' })],
        }),
      ),
    ).toEqual({
      lines: {
        0: { categoryId: EXPENSE_PROBLEMS.category },
        1: { amount: EXPENSE_PROBLEMS.amount },
        2: { amount: EXPENSE_PROBLEMS.amount },
      },
    });
  });

  it('marks a line that has only a description', () => {
    expect(
      validateExpense(
        values({ lines: [line(), line({ categoryId: '', amount: '', description: 'algo' })] }),
      ),
    ).toEqual({
      lines: {
        1: { categoryId: EXPENSE_PROBLEMS.category, amount: EXPENSE_PROBLEMS.amount },
      },
    });
  });

  it('asks for at least one line when every one is empty', () => {
    expect(validateExpense(values({ lines: [emptyLine('a'), emptyLine('b')] }))).toEqual({
      lines: { 0: { categoryId: EXPENSE_PROBLEMS.category, amount: EXPENSE_PROBLEMS.amount } },
    });
  });

  it('refuses an amount above the limit and one with three decimals', () => {
    expect(
      validateExpense(values({ lines: [line({ amount: '1000001' }), line({ amount: '1.234' })] }))
        ?.lines,
    ).toEqual({ 0: { amount: EXPENSE_PROBLEMS.amount }, 1: { amount: EXPENSE_PROBLEMS.amount } });
  });

  it('refuses a total above what the service takes, even when every amount is fine', () => {
    const problems = validateExpense(
      values({ lines: [line({ amount: '600000' }), line({ amount: '400000.01' })] }),
    );

    expect(problems).toEqual({ lines: {}, total: EXPENSE_PROBLEMS.total });
    expect(
      validateExpense(values({ lines: [line({ amount: '600000' }), line({ amount: '400000' })] })),
    ).toBeNull();
  });

  it('sends nothing the service would refuse for its total', () => {
    const request = toCreateRepairExpenseRequest(
      values({ lines: [line({ amount: '600000' }), line({ amount: '400000' })] }),
      EXPENSE_ID,
    );

    expect(createRepairExpenseRequestSchema.safeParse(request).success).toBe(true);
  });
});
