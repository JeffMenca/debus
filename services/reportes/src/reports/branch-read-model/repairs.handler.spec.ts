import { createEnvelope, exampleRepairExpenseAdded } from '@debus/contracts';
import { RepairsHandler } from './repairs.handler';

const setup = () => {
  const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1), $queryRawUnsafe: jest.fn() };
  const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
  return { tx, prisma, handler: new RepairsHandler(prisma as never) };
};
const envelope = createEnvelope('RepairExpenseAdded', {}, 'c');

describe('RepairsHandler', () => {
  it('keeps one row per line, numbered from zero, and ignores a repeated expense', async () => {
    const { tx, handler } = setup();
    const expense = exampleRepairExpenseAdded;

    await handler.added(expense, envelope, tx);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const [sql, ...first] = tx.$executeRawUnsafe.mock.calls[0] ?? [];
    expect(sql).toContain('INSERT INTO branch_report_repair_lines');
    expect(sql).toContain('ON CONFLICT (expense_id, line_no) DO NOTHING');
    expect(first).toEqual([
      expense.expenseId,
      0,
      expense.branchId,
      expense.busId,
      expense.serviceDate,
      expense.lines[0]?.categoryId,
      'Llantas',
      'PART',
      'Dos llantas delanteras',
      2400,
    ]);
    expect(tx.$executeRawUnsafe.mock.calls[1]?.slice(1, 3)).toEqual([expense.expenseId, 1]);
  });

  it('rejects an expense whose lines do not add up without writing', async () => {
    const { tx, handler } = setup();

    await expect(
      handler.added({ ...exampleRepairExpenseAdded, total: 1 }, envelope, tx),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('falls back to the service client outside the inbox transaction', async () => {
    const { prisma, handler } = setup();

    await handler.added(exampleRepairExpenseAdded, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
