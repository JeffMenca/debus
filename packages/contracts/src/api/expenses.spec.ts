import {
  EVENT_AMOUNT_MAX,
  REPAIR_EXPENSE_LINES_MAX,
  repairExpenseAddedPayloadSchema,
  createExpenseCategoryRequestSchema,
  createRepairExpenseRequestSchema,
  repairExpenseListQuerySchema,
  updateExpenseCategoryRequestSchema,
} from '../index';

const line = {
  categoryId: '7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918',
  kind: 'PART',
  description: 'Cuatro llantas 295/80',
  amount: 5200,
};
const expense = {
  id: '8f7e6d5c-4b3a-4291-8f0e-1d2c3b4a5968',
  busId: '1f0e2d3c-4b5a-4968-8776-655443322110',
  serviceDate: '2026-10-23',
  lines: [line],
};

describe('expense categories', () => {
  it('trims the name and refuses an empty one', () => {
    expect(createExpenseCategoryRequestSchema.parse({ name: '  Llantas ' })).toEqual({
      name: 'Llantas',
    });
    expect(createExpenseCategoryRequestSchema.safeParse({ name: ' ' }).success).toBe(false);
  });

  it('changes the name or the active flag, but at least one of them', () => {
    expect(updateExpenseCategoryRequestSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateExpenseCategoryRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('repair expenses', () => {
  it('accepts a header with lines of labour and parts', () => {
    expect(
      createRepairExpenseRequestSchema.parse({
        ...expense,
        lines: [line, { ...line, kind: 'LABOR', description: 'Cambio de aceite', amount: 350.5 }],
      }).lines,
    ).toHaveLength(2);
  });

  it('needs at least one line and at most the maximum', () => {
    expect(createRepairExpenseRequestSchema.safeParse({ ...expense, lines: [] }).success).toBe(
      false,
    );
    expect(
      createRepairExpenseRequestSchema.safeParse({
        ...expense,
        lines: Array.from({ length: REPAIR_EXPENSE_LINES_MAX + 1 }, () => line),
      }).success,
    ).toBe(false);
  });

  it('refuses an amount of zero and one with more than two decimals', () => {
    for (const amount of [0, 10.123]) {
      expect(
        createRepairExpenseRequestSchema.safeParse({ ...expense, lines: [{ ...line, amount }] })
          .success,
      ).toBe(false);
    }
  });

  it('keeps the total within what the event can carry', () => {
    const half = { ...line, amount: EVENT_AMOUNT_MAX / 2 };
    const request = (lines: unknown[]) =>
      createRepairExpenseRequestSchema.safeParse({ ...expense, lines });

    expect(request([half, half]).success).toBe(true);
    expect(request([half, { ...half, amount: half.amount + 0.01 }]).success).toBe(false);
  });

  it('never accepts an expense whose event would not fit its own contract', () => {
    const lines = [
      { ...line, amount: 600_000 },
      { ...line, amount: 600_000 },
    ];
    const accepted = createRepairExpenseRequestSchema.safeParse({ ...expense, lines }).success;
    const event = repairExpenseAddedPayloadSchema.safeParse({
      expenseId: expense.id,
      branchId: expense.busId,
      busId: expense.busId,
      serviceDate: expense.serviceDate,
      total: 1_200_000,
      lines: lines.map((item) => ({ ...item, categoryName: 'Llantas' })),
    }).success;

    expect(accepted).toBe(event);
  });

  it('filters by bus, category and an optional range', () => {
    expect(
      repairExpenseListQuerySchema.safeParse({ from: '2026-10-25', to: '2026-10-01' }).success,
    ).toBe(false);
    expect(repairExpenseListQuerySchema.parse({ busId: expense.busId })).toMatchObject({ page: 1 });
  });
});
