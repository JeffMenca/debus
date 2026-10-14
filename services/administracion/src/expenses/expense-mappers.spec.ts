import { repairExpenseAddedPayloadSchema, repairExpenseSchema } from '@debus/contracts';
import { Prisma } from '../generated/prisma/client';
import { toRepairExpense, toRepairExpenseAddedPayload } from './expense-mappers';

const row = {
  id: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
  branchId: '11111111-1111-4111-8111-111111111111',
  busId: '22222222-2222-4222-8222-222222222222',
  busPlate: 'C482BTX',
  serviceDate: new Date('2026-10-15T00:00:00Z'),
  total: new Prisma.Decimal('5550.50'),
  laborTotal: new Prisma.Decimal('350.50'),
  partsTotal: new Prisma.Decimal('5200'),
  createdById: '33333333-3333-4333-8333-333333333333',
  searchText: 'c482btx',
  createdAt: new Date(),
  lines: [
    {
      id: 'l2',
      expenseId: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
      categoryId: '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b',
      kind: 'LABOR' as const,
      description: 'Cambio de aceite',
      amount: new Prisma.Decimal('350.50'),
      position: 1,
      category: { name: 'Cambio de aceite' },
    },
    {
      id: 'l1',
      expenseId: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
      categoryId: '7f6a5b4c-0d9e-4f8a-9b1c-3d4e5f6a7b8c',
      kind: 'PART' as const,
      description: '',
      amount: new Prisma.Decimal('5200'),
      position: 0,
      category: { name: 'Llantas' },
    },
  ],
};

describe('toRepairExpense', () => {
  it('maps the row to the API shape, with numbers, a plain date and the lines in order', () => {
    const expense = toRepairExpense(row);

    expect(repairExpenseSchema.parse(expense)).toEqual(expense);
    expect(expense).toMatchObject({
      id: row.id,
      busPlate: 'C482BTX',
      serviceDate: '2026-10-15',
      total: 5550.5,
      laborTotal: 350.5,
      partsTotal: 5200,
    });
    expect(expense.lines.map((line) => [line.categoryName, line.kind, line.amount])).toEqual([
      ['Llantas', 'PART', 5200],
      ['Cambio de aceite', 'LABOR', 350.5],
    ]);
  });
});

describe('toRepairExpenseAddedPayload', () => {
  it('builds an event that the contract accepts', () => {
    const payload = toRepairExpenseAddedPayload(row);

    expect(repairExpenseAddedPayloadSchema.parse(payload)).toEqual(payload);
    expect(payload).toMatchObject({
      expenseId: row.id,
      branchId: row.branchId,
      busId: row.busId,
      serviceDate: '2026-10-15',
      total: 5550.5,
    });
    expect(payload.lines.map((line) => line.categoryName)).toEqual(['Llantas', 'Cambio de aceite']);
  });
});
