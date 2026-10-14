import { repairExpenseAddedPayloadSchema } from '@debus/contracts';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { EXPENSE_MESSAGES } from './expense-messages';
import { RepairExpensesService } from './repair-expenses.service';

const branchId = '11111111-1111-4111-8111-111111111111';
const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  role: 'BRANCH_ADMIN' as const,
  branchId,
};
const llantas = '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b';
const aceite = '7f6a5b4c-0d9e-4f8a-9b1c-3d4e5f6a7b8c';
const input = {
  id: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
  busId: '22222222-2222-4222-8222-222222222222',
  serviceDate: '2026-10-15',
  lines: [
    { categoryId: llantas, kind: 'PART' as const, description: 'Dos llantas', amount: 5200 },
    { categoryId: aceite, kind: 'LABOR' as const, description: '', amount: 350.5 },
  ],
};
const row = {
  id: input.id,
  branchId,
  busId: input.busId,
  busPlate: 'C482BTX',
  serviceDate: new Date('2026-10-15T00:00:00Z'),
  total: new Prisma.Decimal('5550.5'),
  laborTotal: new Prisma.Decimal('350.5'),
  partsTotal: new Prisma.Decimal('5200'),
  createdById: actor.userId,
  searchText: 'c482btx',
  createdAt: new Date(),
  lines: [
    {
      id: 'l1',
      expenseId: input.id,
      categoryId: llantas,
      kind: 'PART' as const,
      description: 'Dos llantas',
      amount: new Prisma.Decimal('5200'),
      position: 0,
      category: { name: 'Llantas' },
    },
    {
      id: 'l2',
      expenseId: input.id,
      categoryId: aceite,
      kind: 'LABOR' as const,
      description: '',
      amount: new Prisma.Decimal('350.5'),
      position: 1,
      category: { name: 'Cambio de aceite' },
    },
  ],
};
const prismaError = (code: string) => Object.assign(new Error(code), { code });

const setup = () => {
  const tx = { repairExpense: { create: jest.fn().mockResolvedValue(row) } };
  const prisma = {
    repairExpense: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: new Prisma.Decimal('5550.5') } }),
    },
    busCopy: {
      findUnique: jest.fn().mockResolvedValue({
        id: input.busId,
        branchId,
        plate: 'C482BTX',
        active: true,
      }),
    },
    expenseCategory: {
      findMany: jest.fn().mockResolvedValue([
        { id: llantas, active: true },
        { id: aceite, active: true },
      ]),
    },
    $transaction: jest.fn(async (work: unknown) =>
      typeof work === 'function' ? work(tx) : Promise.all(work as Promise<unknown>[]),
    ),
  };
  const events = { repairExpenseAdded: jest.fn().mockResolvedValue(undefined), flush: jest.fn() };
  return {
    tx,
    prisma,
    events,
    service: new RepairExpensesService(prisma as never, events as never),
  };
};

describe('RepairExpensesService.create', () => {
  it('saves the header and the lines in order, with the totals, in one transaction', async () => {
    const { tx, service } = setup();

    await service.create(actor, input);

    expect(tx.repairExpense.create).toHaveBeenCalledWith({
      data: {
        id: input.id,
        branchId,
        busId: input.busId,
        busPlate: 'C482BTX',
        serviceDate: new Date('2026-10-15T00:00:00Z'),
        total: 5550.5,
        laborTotal: 350.5,
        partsTotal: 5200,
        createdById: actor.userId,
        lines: {
          create: [
            { ...input.lines[0], position: 0 },
            { ...input.lines[1], position: 1 },
          ],
        },
      },
      include: {
        lines: { include: { category: { select: { name: true } } }, orderBy: { position: 'asc' } },
      },
    });
  });

  it('publishes RepairExpenseAdded in the same transaction, valid for its contract, and flushes', async () => {
    const { tx, events, service } = setup();

    const result = await service.create(actor, input, 'c');

    const [client, payload, correlationId] = events.repairExpenseAdded.mock.calls[0] ?? [];
    expect(client).toBe(tx);
    expect(repairExpenseAddedPayloadSchema.parse(payload)).toMatchObject({
      expenseId: input.id,
      branchId,
      total: 5550.5,
    });
    expect(correlationId).toBe('c');
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(true);
    expect(result.expense).toMatchObject({ id: input.id, total: 5550.5 });
  });

  it('returns the saved expense without writing or publishing when the id already exists', async () => {
    const { prisma, tx, events, service } = setup();
    prisma.repairExpense.findUnique.mockResolvedValue(row);

    const result = await service.create(actor, input);

    expect(result).toMatchObject({ created: false, expense: { id: input.id } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.repairExpense.create).not.toHaveBeenCalled();
    expect(events.repairExpenseAdded).not.toHaveBeenCalled();
  });

  it('does not reveal an expense of another branch that has the same id', async () => {
    const { prisma, service } = setup();
    prisma.repairExpense.findUnique.mockResolvedValue({ ...row, branchId: 'otra' });

    await expect(service.create(actor, input)).rejects.toEqual(
      new NotFoundException(EXPENSE_MESSAGES.expenseNotFound),
    );
  });

  it('treats a concurrent insert of the same id as the saved expense', async () => {
    const { prisma, tx, events, service } = setup();
    tx.repairExpense.create.mockRejectedValue(prismaError('P2002'));
    prisma.repairExpense.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row);

    const result = await service.create(actor, input);

    expect(result.created).toBe(false);
    expect(events.flush).not.toHaveBeenCalled();
  });

  it('lets a unique violation through when no expense with that id exists', async () => {
    const { tx, service } = setup();
    tx.repairExpense.create.mockRejectedValue(prismaError('P2002'));

    await expect(service.create(actor, input)).rejects.toThrow('P2002');
  });

  it('lets an unexpected database error through', async () => {
    const { tx, service } = setup();
    tx.repairExpense.create.mockRejectedValue(new Error('down'));

    await expect(service.create(actor, input)).rejects.toThrow('down');
  });

  it.each([
    ['the bus is not in the branch', 'busCopy', null, 'busNotFound'],
    [
      'the bus is deactivated',
      'busCopy',
      { id: input.busId, branchId, plate: 'C482BTX', active: false },
      'busInactive',
    ],
  ] as const)('refuses with a conflict when %s', async (_label, table, value, problem) => {
    const { prisma, tx, service } = setup();
    prisma[table].findUnique.mockResolvedValue(value);

    await expect(service.create(actor, input)).rejects.toEqual(
      new ConflictException(EXPENSE_MESSAGES[problem]),
    );
    expect(tx.repairExpense.create).not.toHaveBeenCalled();
  });

  it('refuses a category that does not exist or is deactivated', async () => {
    const { prisma, service } = setup();
    prisma.expenseCategory.findMany.mockResolvedValue([{ id: llantas, active: true }]);

    await expect(service.create(actor, input)).rejects.toEqual(
      new ConflictException(EXPENSE_MESSAGES.categoryNotFound),
    );

    prisma.expenseCategory.findMany.mockResolvedValue([
      { id: llantas, active: true },
      { id: aceite, active: false },
    ]);
    await expect(service.create(actor, input)).rejects.toEqual(
      new ConflictException(EXPENSE_MESSAGES.categoryInactive),
    );
  });

  it('needs an account that belongs to a branch', async () => {
    const { service } = setup();

    await expect(service.create({ ...actor, branchId: null }, input)).rejects.toThrow();
  });
});

describe('RepairExpensesService reads', () => {
  it('lists a page of the branch, newest first, with the total of the whole filtered set', async () => {
    const { prisma, service } = setup();

    const page = await service.list(branchId, { page: 2, pageSize: 5, busId: input.busId });

    expect(prisma.repairExpense.findMany).toHaveBeenCalledWith({
      where: { branchId, busId: input.busId },
      include: {
        lines: { include: { category: { select: { name: true } } }, orderBy: { position: 'asc' } },
      },
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
    });
    expect(prisma.repairExpense.aggregate).toHaveBeenCalledWith({
      where: { branchId, busId: input.busId },
      _sum: { total: true },
    });
    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 5, summary: { total: 5550.5 } });
    expect(page.items).toHaveLength(1);
  });

  it('sums to zero when nothing matches', async () => {
    const { prisma, service } = setup();
    prisma.repairExpense.aggregate.mockResolvedValue({ _sum: { total: null } });

    expect((await service.list(branchId, { page: 1, pageSize: 20 })).summary).toEqual({ total: 0 });
  });

  it('gets one expense of the branch', async () => {
    const { prisma, service } = setup();

    expect(await service.get(branchId, input.id)).toMatchObject({ id: input.id });
    expect(prisma.repairExpense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: input.id, branchId } }),
    );
  });

  it('answers 404 for an expense that is not in the branch', async () => {
    const { prisma, service } = setup();
    prisma.repairExpense.findFirst.mockResolvedValue(null);

    await expect(service.get(branchId, input.id)).rejects.toEqual(
      new NotFoundException(EXPENSE_MESSAGES.expenseNotFound),
    );
  });
});
