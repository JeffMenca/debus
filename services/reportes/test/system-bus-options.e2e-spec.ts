import { randomUUID } from 'node:crypto';
import { exampleBus, systemBusOptionsPageSchema } from '@debus/contracts';
import type { InMemoryEventBus } from '@debus/messaging';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { cleanReportesTestData } from './support/cleanup';
import { expectOnlySystemAdmin, getAsSystemAdmin } from './support/http';
import { addBranch } from './support/system-finance-fixture';

describe('system bus options', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: InMemoryEventBus;
  let branch: { id: string; name: string };
  let otherBranch: { id: string; name: string };

  const get = (path: string) => getAsSystemAdmin(app, path);
  const addBus = async (branchId: string, plate: string, brand: string, over = {}) => {
    const busId = randomUUID();
    await bus.deliver('BusAdded', { ...exampleBus, busId, branchId, plate, brand, ...over });
    return busId;
  };

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
    branch = await addBranch(bus, 'opciones de bus');
    otherBranch = await addBranch(bus, 'opciones de bus otra');
    await addBus(branch.id, 'P222BBB', 'Hino');
    await addBus(branch.id, 'P111AAA', 'Volvó');
    await addBus(branch.id, 'P333CCC', 'Mercedes', { active: false });
    await addBus(otherBranch.id, 'P444DDD', 'Volvó');
  });
  afterAll(async () => {
    try {
      await cleanReportesTestData(prisma, [branch.id, otherBranch.id]);
    } finally {
      await app.close();
    }
  });

  it('lists the buses of a branch by plate, inactive ones too, with the name of the branch', async () => {
    const response = await get(`/reports/system-bus-options?branchId=${branch.id}`).expect(200);
    const page = systemBusOptionsPageSchema.parse(response.body);

    expect(page.items.map((item) => [item.plate, item.brand, item.branchName])).toEqual([
      ['P111AAA', 'Volvó', branch.name],
      ['P222BBB', 'Hino', branch.name],
      ['P333CCC', 'Mercedes', branch.name],
    ]);
    expect(page.summary).toEqual({ totals: { buses: 3 }, groups: [] });
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 20 });
  });

  it('lists the buses of every branch when none is chosen', async () => {
    const response = await get('/reports/system-bus-options?q=p444ddd').expect(200);

    expect(response.body.items.map((item: { branchName: string }) => item.branchName)).toEqual([
      otherBranch.name,
    ]);
  });

  it('searches by plate, brand or model without accents or case', async () => {
    const volvo = await get(`/reports/system-bus-options?branchId=${branch.id}&q=VOLVO`).expect(
      200,
    );
    expect(volvo.body.items.map((item: { plate: string }) => item.plate)).toEqual(['P111AAA']);

    const plate = await get(`/reports/system-bus-options?branchId=${branch.id}&q=p222`).expect(200);
    expect(plate.body.items.map((item: { plate: string }) => item.plate)).toEqual(['P222BBB']);

    const model = await get(`/reports/system-bus-options?branchId=${branch.id}&q=b8r`).expect(200);
    expect(model.body.total).toBe(3);

    const none = await get(`/reports/system-bus-options?branchId=${branch.id}&q=zzz`).expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0 });
  });

  it('takes a percent sign or an underscore as text, not as a wildcard', async () => {
    const response = await get(`/reports/system-bus-options?branchId=${branch.id}&q=%25`).expect(
      200,
    );

    expect(response.body.total).toBe(0);
  });

  it('pages in the server and keeps the total of the search', async () => {
    const second = await get(
      `/reports/system-bus-options?branchId=${branch.id}&pageSize=2&page=2`,
    ).expect(200);

    expect(second.body.items.map((item: { plate: string }) => item.plate)).toEqual(['P333CCC']);
    expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  });

  it('refuses an id that is not one, a page size over the limit or a search that is too long', async () => {
    await get('/reports/system-bus-options?branchId=not-an-id').expect(400);
    await get('/reports/system-bus-options?pageSize=101').expect(400);
    await get(`/reports/system-bus-options?q=${'a'.repeat(81)}`).expect(400);
  });

  it('answers only to the system administrator', async () => {
    await expectOnlySystemAdmin(app, ['/reports/system-bus-options']);
  });
});
