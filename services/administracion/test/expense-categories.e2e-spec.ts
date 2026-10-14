import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import { expenseCategoryPageSchema, expenseCategorySchema } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';
import { identityHeaders } from './support/identity';

describe('expense categories', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;
  const systemAdmin = () => identityHeaders(randomUUID(), 'SYSTEM_ADMIN');
  const branchAdmin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branchId);
  const http = () => request(app.getHttpServer());
  // At most 40 characters, the limit of a category name.
  const name = (label: string) =>
    `${TEST_BRANCH_PREFIX}${TEST_RUN} ${label} ${randomUUID().slice(0, 6)}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = (await createTestBranch(prisma)).id;
  });
  afterAll(async () => {
    try {
      await cleanTestData(prisma);
    } finally {
      await app?.close();
    }
  });

  it('creates, renames, deactivates and reactivates a category', async () => {
    const turbo = name('Turbo');

    const created = await http()
      .post('/expense-categories')
      .set(systemAdmin())
      .send({ name: turbo })
      .expect(201);
    expect(expenseCategorySchema.parse(created.body)).toEqual({
      id: expect.any(String),
      name: turbo,
      active: true,
      inUse: false,
    });
    const id = created.body.id as string;

    const renamedTo = name('Turbo doble');
    const renamed = await http()
      .patch(`/expense-categories/${id}`)
      .set(systemAdmin())
      .send({ name: renamedTo })
      .expect(200);
    expect(renamed.body).toMatchObject({ name: renamedTo, active: true });

    const off = await http()
      .patch(`/expense-categories/${id}`)
      .set(systemAdmin())
      .send({ active: false })
      .expect(200);
    expect(off.body.active).toBe(false);

    const inactive = await http()
      .get('/expense-categories')
      .query({ status: 'inactive', q: renamedTo })
      .set(systemAdmin())
      .expect(200);
    expect(expenseCategoryPageSchema.parse(inactive.body).items.map((item) => item.id)).toContain(
      id,
    );

    await http()
      .patch(`/expense-categories/${id}`)
      .set(systemAdmin())
      .send({ active: true })
      .expect(200);
    const stillInactive = await http()
      .get('/expense-categories')
      .query({ status: 'inactive', q: renamedTo })
      .set(systemAdmin())
      .expect(200);
    expect(stillInactive.body.items).toEqual([]);
  });

  it('lists the seeded categories to a branch admin, paged and ordered by name', async () => {
    const page = await http()
      .get('/expense-categories')
      .query({ pageSize: 3 })
      .set(branchAdmin())
      .expect(200);

    const parsed = expenseCategoryPageSchema.parse(page.body);
    expect(parsed.pageSize).toBe(3);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.total).toBeGreaterThanOrEqual(8);
    const names = parsed.items.map((item) => item.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('finds a category without accents or capitals', async () => {
    const page = await http()
      .get('/expense-categories')
      .query({ q: 'suspension' })
      .set(branchAdmin())
      .expect(200);

    expect(page.body.items).toEqual([expect.objectContaining({ name: 'Suspensión' })]);
  });

  it('refuses a name that already exists, whatever its case, and a name that is too short', async () => {
    const taken = await http()
      .post('/expense-categories')
      .set(systemAdmin())
      .send({ name: 'llantas' })
      .expect(409);
    expect(taken.body.message).toBe('Ya existe una categoría con ese nombre.');

    await http().post('/expense-categories').set(systemAdmin()).send({ name: 'a' }).expect(400);
  });

  it('only lets the system admin change the catalog', async () => {
    const id = 'a1000000-0000-4000-8000-000000000001';

    await http()
      .post('/expense-categories')
      .set(branchAdmin())
      .send({ name: name('x') })
      .expect(403);
    await http()
      .patch(`/expense-categories/${id}`)
      .set(branchAdmin())
      .send({ active: false })
      .expect(403);
    await http().delete(`/expense-categories/${id}`).set(branchAdmin()).expect(403);
    await http()
      .get('/expense-categories')
      .set(identityHeaders(randomUUID(), 'CASHIER', branchId))
      .expect(403);
  });

  it('answers 404 for a category that does not exist', async () => {
    const missing = randomUUID();

    await http()
      .patch(`/expense-categories/${missing}`)
      .set(systemAdmin())
      .send({ active: false })
      .expect(404);
    const removed = await http()
      .delete(`/expense-categories/${missing}`)
      .set(systemAdmin())
      .expect(404);
    expect(removed.body.message).toBe('No encontramos esa categoría.');
  });

  it('removes a category that has no expenses', async () => {
    const created = await http()
      .post('/expense-categories')
      .set(systemAdmin())
      .send({ name: name('Temporal') })
      .expect(201);

    await http().delete(`/expense-categories/${created.body.id}`).set(systemAdmin()).expect(204);

    expect(await prisma.expenseCategory.count({ where: { id: created.body.id } })).toBe(0);
  });

  it('refuses to remove a category that has expenses, marks it in use and lets it be deactivated', async () => {
    const created = await http()
      .post('/expense-categories')
      .set(systemAdmin())
      .send({ name: name('Con gastos') })
      .expect(201);
    await prisma.repairExpense.create({
      data: {
        id: randomUUID(),
        branchId,
        busId: randomUUID(),
        busPlate: 'ZZ-3',
        serviceDate: new Date('2026-10-12'),
        total: 10,
        laborTotal: 10,
        partsTotal: 0,
        createdById: randomUUID(),
        lines: {
          create: [
            {
              categoryId: created.body.id,
              kind: 'LABOR',
              description: 'Prueba',
              amount: 10,
              position: 0,
            },
          ],
        },
      },
    });

    const refused = await http()
      .delete(`/expense-categories/${created.body.id}`)
      .set(systemAdmin())
      .expect(409);
    expect(refused.body.message).toBe(
      'Esta categoría ya tiene gastos. Desactívala para que no se use más.',
    );

    const off = await http()
      .patch(`/expense-categories/${created.body.id}`)
      .set(systemAdmin())
      .send({ active: false })
      .expect(200);
    expect(off.body).toMatchObject({ active: false, inUse: true });
  });
});
