import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanFleetTestData } from './support/cleanup';

describe('fleet schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    branchId = await seedTestBranch(prisma, 'schema');
  });
  afterAll(async () => {
    await cleanFleetTestData(prisma);
    await app.close();
  });

  const bus = (plate: string) => ({
    branchId,
    plate,
    brand: 'Volvo',
    model: 'B8R',
    year: 2021,
    capacity: 40,
    mileageKm: 0,
  });

  it('refuses two buses with the same plate', async () => {
    await prisma.bus.create({ data: bus('P100AAA') });
    await expect(prisma.bus.create({ data: bus('P100AAA') })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('keeps an accent-free search text', async () => {
    const created = await prisma.bus.create({ data: { ...bus('P101AAA'), brand: 'Mercédes' } });
    expect(created.searchText).toContain('mercedes');
  });

  it('refuses a route from a branch to itself', async () => {
    await expect(
      prisma.route.create({
        data: {
          id: randomUUID(),
          originBranchId: branchId,
          destinationBranchId: branchId,
          distanceKm: 10,
          ticketPrice: 5,
        },
      }),
    ).rejects.toThrow(/routes_distinct_branches/);
  });
});
