import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import {
  type RepairExpenseAddedPayload,
  createEnvelope,
  exampleBus,
  repairExpenseAddedPayloadSchema,
  repairExpensePageSchema,
  repairExpenseSchema,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';
import { type EventCapture, captureEvents } from './support/events';
import { identityHeaders } from './support/identity';

const LLANTAS = 'a1000000-0000-4000-8000-000000000001';
const ACEITE = 'a1000000-0000-4000-8000-000000000005';

const push = (value: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(value)).toString('base64'), messageId: '1' },
  subscription: 'test',
});

describe('repair expenses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventCapture;
  let branchId: string;
  let otherBranchId: string;
  let busId: string;
  let otherBusId: string;
  let inactiveBusId: string;
  let inactiveCategoryId: string;
  const http = () => request(app.getHttpServer());
  const admin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', branchId);

  const sendBus = (over: Record<string, unknown>) =>
    http()
      .post('/events/pubsub')
      .send(push(createEnvelope('BusAdded', { ...exampleBus, ...over }, 'c')))
      .expect(204);
  const body = (over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    busId,
    serviceDate: '2026-10-15',
    lines: [
      { categoryId: LLANTAS, kind: 'PART', description: 'Dos llantas', amount: 5200 },
      { categoryId: ACEITE, kind: 'LABOR', description: 'Cambio de aceite', amount: 350.5 },
    ],
    ...over,
  });
  // Published events leave the outbox without their payload, so they are counted where they arrive.
  const publishedCount = (expenseId: string) =>
    events.count<RepairExpenseAddedPayload>(
      'RepairExpenseAdded',
      (payload) => payload.expenseId === expenseId,
    );

  beforeAll(async () => {
    events = await captureEvents();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = (await createTestBranch(prisma)).id;
    otherBranchId = (await createTestBranch(prisma)).id;
    [busId, otherBusId, inactiveBusId] = [randomUUID(), randomUUID(), randomUUID()];
    await sendBus({ busId, branchId, plate: 'ZZ100AAA', version: 1 });
    await sendBus({ busId: otherBusId, branchId: otherBranchId, plate: 'ZZ200BBB', version: 1 });
    await sendBus({ busId: inactiveBusId, branchId, plate: 'ZZ300CCC', active: false, version: 1 });
    inactiveCategoryId = (
      await prisma.expenseCategory.create({
        data: {
          name: `${TEST_BRANCH_PREFIX}${TEST_RUN} Apagada`,
          active: false,
        },
      })
    ).id;
  });
  afterAll(async () => {
    try {
      await cleanTestData(prisma);
      await app?.close();
    } finally {
      await events?.close();
    }
  });

  it('registers an expense with its lines, totals and one RepairExpenseAdded event', async () => {
    const input = body();

    const created = await http().post('/repair-expenses').set(admin()).send(input).expect(201);

    const expense = repairExpenseSchema.parse(created.body);
    expect(expense).toMatchObject({
      id: input.id,
      branchId,
      busId,
      busPlate: 'ZZ100AAA',
      serviceDate: '2026-10-15',
      total: 5550.5,
      laborTotal: 350.5,
      partsTotal: 5200,
    });
    expect(expense.lines.map((line) => [line.categoryName, line.kind, line.amount])).toEqual([
      ['Llantas', 'PART', 5200],
      ['Cambio de aceite', 'LABOR', 350.5],
    ]);
    const payload = await events.next<RepairExpenseAddedPayload>(
      'RepairExpenseAdded',
      (event) => event.expenseId === input.id,
    );
    expect(repairExpenseAddedPayloadSchema.parse(payload)).toMatchObject({
      expenseId: input.id,
      branchId,
      busId,
      total: 5550.5,
    });
    expect(await publishedCount(input.id)).toBe(1);
  });

  it('answers 200 with the first expense, and publishes nothing new, when the same id arrives again', async () => {
    const input = body();
    await http().post('/repair-expenses').set(admin()).send(input).expect(201);

    const again = await http()
      .post('/repair-expenses')
      .set(admin())
      .send({ ...input, lines: [{ ...input.lines[0], amount: 1 }] })
      .expect(200);

    expect(again.body).toMatchObject({ id: input.id, total: 5550.5 });
    expect(await prisma.repairExpense.count({ where: { id: input.id } })).toBe(1);
    expect(await publishedCount(input.id)).toBe(1);
  });

  it('saves one expense when the same request arrives twice at once', async () => {
    const input = body();

    const answers = await Promise.all([
      http().post('/repair-expenses').set(admin()).send(input),
      http().post('/repair-expenses').set(admin()).send(input),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 201]);
    expect(await prisma.repairExpense.count({ where: { id: input.id } })).toBe(1);
    expect(await publishedCount(input.id)).toBe(1);
  });

  it('does not show or reuse an expense of another branch', async () => {
    const input = body({ busId: otherBusId });
    await http()
      .post('/repair-expenses')
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN', otherBranchId))
      .send(input)
      .expect(201);

    await http().get(`/repair-expenses/${input.id}`).set(admin()).expect(404);
    const reused = await http().post('/repair-expenses').set(admin()).send(input).expect(404);
    expect(reused.body.message).toBe('No encontramos ese gasto.');
  });

  it('refuses a bus of another branch, an unknown bus and a deactivated bus', async () => {
    const other = await http()
      .post('/repair-expenses')
      .set(admin())
      .send(body({ busId: otherBusId }))
      .expect(409);
    expect(other.body.message).toBe('No encontramos ese bus en tu sucursal.');
    await http()
      .post('/repair-expenses')
      .set(admin())
      .send(body({ busId: randomUUID() }))
      .expect(409);
    const inactive = await http()
      .post('/repair-expenses')
      .set(admin())
      .send(body({ busId: inactiveBusId }))
      .expect(409);
    expect(inactive.body.message).toBe('Ese bus está desactivado.');
  });

  it('refuses a deactivated category and an unknown one, and saves nothing', async () => {
    const input = body({
      lines: [{ categoryId: inactiveCategoryId, kind: 'PART', description: '', amount: 10 }],
    });

    const inactive = await http().post('/repair-expenses').set(admin()).send(input).expect(409);
    expect(inactive.body.message).toBe('Una de las categorías está desactivada. Elige otra.');
    await http()
      .post('/repair-expenses')
      .set(admin())
      .send({ ...input, lines: [{ ...input.lines[0], categoryId: randomUUID() }] })
      .expect(409);
    expect(await prisma.repairExpense.count({ where: { id: input.id } })).toBe(0);
    expect(await publishedCount(input.id)).toBe(0);
  });

  it('refuses invalid data with 400', async () => {
    await http()
      .post('/repair-expenses')
      .set(admin())
      .send(body({ lines: [] }))
      .expect(400);
    await http()
      .post('/repair-expenses')
      .set(admin())
      .send(body({ lines: [{ categoryId: LLANTAS, kind: 'PART', description: '', amount: 0 }] }))
      .expect(400);
    await http()
      .post('/repair-expenses')
      .set(admin())
      .send(body({ serviceDate: 'ayer' }))
      .expect(400);
    await http().post('/repair-expenses').set(admin()).send({}).expect(400);
  });

  it('refuses an expense whose total would not fit its own event, and saves nothing', async () => {
    const input = body({
      lines: [
        { categoryId: LLANTAS, kind: 'PART', description: '', amount: 600_000 },
        { categoryId: ACEITE, kind: 'LABOR', description: '', amount: 600_000 },
      ],
    });

    await http().post('/repair-expenses').set(admin()).send(input).expect(400);

    expect(await prisma.repairExpense.count({ where: { id: input.id } })).toBe(0);
    expect(await publishedCount(input.id)).toBe(0);
  });

  it('accepts an expense whose total is exactly the largest amount an event carries', async () => {
    const input = body({
      lines: [
        { categoryId: LLANTAS, kind: 'PART', description: '', amount: 600_000 },
        { categoryId: ACEITE, kind: 'LABOR', description: '', amount: 400_000 },
      ],
    });

    const created = await http().post('/repair-expenses').set(admin()).send(input).expect(201);

    expect(created.body.total).toBe(1_000_000);
    const payload = await events.next<RepairExpenseAddedPayload>(
      'RepairExpenseAdded',
      (event) => event.expenseId === input.id,
    );
    expect(repairExpenseAddedPayloadSchema.parse(payload).total).toBe(1_000_000);
  });

  it('only lets a branch admin of a branch use the expenses', async () => {
    await http()
      .get('/repair-expenses')
      .set(identityHeaders(randomUUID(), 'SYSTEM_ADMIN'))
      .expect(403);
    await http()
      .post('/repair-expenses')
      .set(identityHeaders(randomUUID(), 'CASHIER', branchId))
      .send(body())
      .expect(403);
    await http()
      .get('/repair-expenses')
      .set(identityHeaders(randomUUID(), 'BRANCH_ADMIN'))
      .expect(403);
    await http().get('/repair-expenses').expect(401);
  });

  it('gets one expense by id', async () => {
    const input = body();
    await http().post('/repair-expenses').set(admin()).send(input).expect(201);

    const found = await http().get(`/repair-expenses/${input.id}`).set(admin()).expect(200);

    expect(repairExpenseSchema.parse(found.body).id).toBe(input.id);
    await http().get(`/repair-expenses/${randomUUID()}`).set(admin()).expect(404);
    await http().get('/repair-expenses/no-es-un-id').set(admin()).expect(400);
  });

  describe('listing', () => {
    let listBranch: string;
    let listBus: string;
    const listAdmin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', listBranch);

    beforeAll(async () => {
      listBranch = (await createTestBranch(prisma)).id;
      listBus = randomUUID();
      await sendBus({ busId: listBus, branchId: listBranch, plate: 'ZZ400LST', version: 1 });
      const save = (serviceDate: string, categoryId: string, amount: number) =>
        http()
          .post('/repair-expenses')
          .set(listAdmin())
          .send(
            body({
              busId: listBus,
              serviceDate,
              lines: [{ categoryId, kind: 'PART', description: '', amount }],
            }),
          )
          .expect(201);
      await save('2026-10-01', LLANTAS, 100);
      await save('2026-10-10', ACEITE, 200);
      await save('2026-10-20', LLANTAS, 300);
    });

    it('lists the branch expenses newest first with the total of the whole filtered set', async () => {
      const page = await http()
        .get('/repair-expenses')
        .query({ pageSize: 2 })
        .set(listAdmin())
        .expect(200);

      const parsed = repairExpensePageSchema.parse(page.body);
      expect(parsed).toMatchObject({ total: 3, page: 1, pageSize: 2, summary: { total: 600 } });
      expect(parsed.items.map((item) => item.serviceDate)).toEqual(['2026-10-20', '2026-10-10']);
      const second = await http()
        .get('/repair-expenses')
        .query({ pageSize: 2, page: 2 })
        .set(listAdmin())
        .expect(200);
      expect(second.body.items.map((item: { serviceDate: string }) => item.serviceDate)).toEqual([
        '2026-10-01',
      ]);
    });

    it('filters by category and its total follows the filter', async () => {
      const page = await http()
        .get('/repair-expenses')
        .query({ categoryId: LLANTAS })
        .set(listAdmin())
        .expect(200);

      expect(page.body).toMatchObject({ total: 2, summary: { total: 400 } });
    });

    it('filters by date range, with both days included, and by bus', async () => {
      const range = await http()
        .get('/repair-expenses')
        .query({ from: '2026-10-10', to: '2026-10-20', busId: listBus })
        .set(listAdmin())
        .expect(200);
      expect(range.body).toMatchObject({ total: 2, summary: { total: 500 } });

      const none = await http()
        .get('/repair-expenses')
        .query({ busId: randomUUID() })
        .set(listAdmin())
        .expect(200);
      expect(none.body).toMatchObject({ items: [], total: 0, summary: { total: 0 } });
    });

    it('finds expenses by the plate of the bus without accents or capitals', async () => {
      const page = await http()
        .get('/repair-expenses')
        .query({ q: 'zz400l' })
        .set(listAdmin())
        .expect(200);
      expect(page.body.total).toBe(3);

      const other = await http()
        .get('/repair-expenses')
        .query({ q: 'zz400l' })
        .set(admin())
        .expect(200);
      expect(other.body.total).toBe(0);
    });

    it('refuses a range that ends before it starts', async () => {
      await http()
        .get('/repair-expenses')
        .query({ from: '2026-10-20', to: '2026-10-01' })
        .set(listAdmin())
        .expect(400);
    });
  });

  describe('searching', () => {
    let searchBranch: string;
    let searchBus: string;
    let paintId: string;
    const searchAdmin = () => identityHeaders(randomUUID(), 'BRANCH_ADMIN', searchBranch);
    const find = async (q: string) =>
      (await http().get('/repair-expenses').query({ q }).set(searchAdmin()).expect(200)).body
        .total as number;

    beforeAll(async () => {
      searchBranch = (await createTestBranch(prisma)).id;
      searchBus = randomUUID();
      await sendBus({ busId: searchBus, branchId: searchBranch, plate: 'ZZ500SRC', version: 1 });
      paintId = (
        await prisma.expenseCategory.create({
          data: { name: `${TEST_BRANCH_PREFIX}${TEST_RUN} Pintura` },
        })
      ).id;
      const save = (lines: object[]) =>
        http()
          .post('/repair-expenses')
          .set(searchAdmin())
          .send(body({ busId: searchBus, lines }))
          .expect(201);
      await save([
        { categoryId: LLANTAS, kind: 'PART', description: 'Cuatro llantas 295/80', amount: 100 },
        { categoryId: paintId, kind: 'LABOR', description: 'Retoque de la puerta', amount: 50 },
      ]);
      await save([
        { categoryId: ACEITE, kind: 'LABOR', description: 'Cambio de filtro Ñandú', amount: 200 },
      ]);
    });

    it('finds an expense by the name of any of its categories, without accents or capitals', async () => {
      expect(await find('LLANTAS')).toBe(1);
      expect(await find('aceite')).toBe(1);
      expect(await find('pintura')).toBe(1);
    });

    it('finds an expense by the words of any of its descriptions, without accents', async () => {
      expect(await find('retoque')).toBe(1);
      expect(await find('nandu')).toBe(1);
      expect(await find('295/80')).toBe(1);
    });

    it('still finds it by the plate and finds nothing for words it does not have', async () => {
      expect(await find('zz500s')).toBe(2);
      expect(await find('frenos')).toBe(0);
    });

    it('follows a category that is renamed', async () => {
      await prisma.expenseCategory.update({
        where: { id: paintId },
        data: { name: `${TEST_BRANCH_PREFIX}${TEST_RUN} Hojalatería` },
      });

      expect(await find('hojalateria')).toBe(1);
      expect(await find('pintura')).toBe(0);
    });
  });
});
