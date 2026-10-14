import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import { cleanupStatements } from '@debus/config/test-data-sql';
import { foldSearchText } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';

const SEEDED_IDS = Array.from(
  { length: 8 },
  (_, index) => `a1000000-0000-4000-8000-00000000000${index + 1}`,
);
const SEEDED_NAMES = [
  'Llantas',
  'Motor',
  'Frenos',
  'Suspensión',
  'Cambio de aceite',
  'Eléctrico',
  'Carrocería',
  'Otros',
];

describe('expense tables', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const expenseIds: string[] = [];
  const categoryName = (label: string) =>
    `${TEST_BRANCH_PREFIX}${TEST_RUN} ${label} ${randomUUID()}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    try {
      await prisma.repairExpense.deleteMany({ where: { id: { in: expenseIds } } });
      await cleanTestData(prisma);
    } finally {
      await app?.close();
    }
  });

  const newExpense = (branchId: string, categoryId: string) => {
    const id = randomUUID();
    expenseIds.push(id);
    return prisma.repairExpense.create({
      data: {
        id,
        branchId,
        busId: randomUUID(),
        busPlate: 'ZZ-1',
        serviceDate: new Date('2026-10-12'),
        total: 100,
        laborTotal: 40,
        partsTotal: 60,
        createdById: randomUUID(),
        lines: {
          create: [
            { categoryId, kind: 'PART' as const, description: 'Pieza', amount: 60, position: 0 },
            { categoryId, kind: 'LABOR' as const, description: 'Trabajo', amount: 40, position: 1 },
          ],
        },
      },
    });
  };

  it('seeds the eight categories of the statement, all active, with fixed ids', async () => {
    const rows = await prisma.expenseCategory.findMany({
      where: { id: { in: SEEDED_IDS } },
      orderBy: { id: 'asc' },
    });

    expect(rows.map((row) => row.name)).toEqual(SEEDED_NAMES);
    expect(rows.every((row) => row.active)).toBe(true);
    expect(rows.map((row) => row.searchText)).toContain('suspension');
  });

  it('refuses a category whose name only differs in case', async () => {
    await expect(
      prisma.expenseCategory.create({ data: { name: 'llantas' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps the search text of a category in step with its name', async () => {
    const created = await prisma.expenseCategory.create({ data: { name: categoryName('Ñandú') } });
    expect(created.searchText).toContain('nandu');

    const renamed = await prisma.expenseCategory.update({
      where: { id: created.id },
      data: { name: categoryName('Árbol') },
    });
    expect(renamed.searchText).toContain('arbol');
  });

  it('refuses to delete a category that has expense lines, and cascades the lines of a deleted expense', async () => {
    const branch = await createTestBranch(prisma);
    const category = await prisma.expenseCategory.create({ data: { name: categoryName('Uso') } });
    const expense = await newExpense(branch.id, category.id);
    const saved = await prisma.repairExpense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(saved.searchText).toContain('zz-1');
    expect(saved.searchText).toContain('pieza');
    expect(saved.searchText).toContain('trabajo');
    expect(saved.searchText).toContain(foldSearchText(category.name));

    await expect(
      prisma.expenseCategory.delete({ where: { id: category.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await prisma.repairExpense.delete({ where: { id: expense.id } });
    expect(await prisma.repairExpenseLine.count({ where: { expenseId: expense.id } })).toBe(0);
    await prisma.expenseCategory.delete({ where: { id: category.id } });
  });

  it('cleans what a test run left, but keeps the seeded categories', async () => {
    const branch = await createTestBranch(prisma);
    const category = await prisma.expenseCategory.create({
      data: { name: categoryName('Limpieza') },
    });
    const expense = await newExpense(branch.id, category.id);
    await prisma.tripCost.create({
      data: {
        tripId: randomUUID(),
        branchId: branch.id,
        busId: randomUUID(),
        tripType: 'REGULAR',
        arrivedAt: new Date(),
        distanceKm: 10,
        fuelCost: 1,
        depreciationPerKm: 1,
        depreciationAmount: 10,
        driverPay: 1,
      },
    });
    await prisma.busCopy.create({
      data: { id: randomUUID(), branchId: branch.id, plate: 'ZZ-2', active: true, version: 1 },
    });

    for (const statement of cleanupStatements({ run: TEST_RUN })) {
      await prisma.$executeRawUnsafe(statement);
    }

    expect(await prisma.repairExpense.count({ where: { id: expense.id } })).toBe(0);
    expect(await prisma.repairExpenseLine.count({ where: { expenseId: expense.id } })).toBe(0);
    expect(await prisma.tripCost.count({ where: { branchId: branch.id } })).toBe(0);
    expect(await prisma.busCopy.count({ where: { branchId: branch.id } })).toBe(0);
    expect(await prisma.expenseCategory.count({ where: { id: category.id } })).toBe(0);
    expect(await prisma.expenseCategory.count({ where: { id: { in: SEEDED_IDS } } })).toBe(8);
  });

  it('keeps a test category that an expense of a real branch still uses', async () => {
    const category = await prisma.expenseCategory.create({ data: { name: categoryName('Real') } });
    const expense = await newExpense(randomUUID(), category.id);

    for (const statement of cleanupStatements({ run: TEST_RUN })) {
      await prisma.$executeRawUnsafe(statement);
    }

    expect(await prisma.expenseCategory.count({ where: { id: category.id } })).toBe(1);
    await prisma.repairExpense.delete({ where: { id: expense.id } });
    await prisma.expenseCategory.delete({ where: { id: category.id } });
  });
});
