import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import { exampleBranch } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

describe('reportes schema and common branch copy', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: Awaited<ReturnType<typeof startReportes>>['bus'];
  const ownedBranchIds: string[] = [];

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
  });
  afterAll(async () => {
    try {
      await cleanReportesTestData(prisma, ownedBranchIds);
    } finally {
      await app.close();
    }
  });

  it('folds accents and case in the database the same way as the search box', async () => {
    const rows = await prisma.$queryRawUnsafe<{ folded: string }[]>(
      `SELECT fold_search_text('Ñandú Álvarez') AS folded`,
    );

    expect(rows[0]?.folded).toBe('nandu alvarez');
  });

  it('keeps version 2 of a branch even when version 1 arrives afterwards', async () => {
    const branchId = await seedTestBranch(bus, 'versions');
    ownedBranchIds.push(branchId);
    const named = (name: string, version: number) => ({
      ...exampleBranch,
      branchId,
      name,
      version,
    });

    const prefix = `${TEST_BRANCH_PREFIX}${TEST_RUN}`;

    await bus.deliver('BranchUpdated', named(`${prefix} version dos`, 2));
    await bus.deliver('BranchCreated', named(`${prefix} version uno`, 1));

    expect(await prisma.branchCopy.findUnique({ where: { id: branchId } })).toMatchObject({
      name: `${prefix} version dos`,
      version: 2,
    });
  });

  it('stores one row and one processed event when the same event is delivered twice', async () => {
    const branchId = randomUUID();
    const eventId = randomUUID();
    const payload = { ...exampleBranch, branchId, name: `${exampleBranch.name} duplicado` };

    await bus.deliver('BranchCreated', payload, { eventId });
    await bus.deliver('BranchCreated', payload, { eventId });

    expect(await prisma.branchCopy.count({ where: { id: branchId } })).toBe(1);
    expect(await prisma.processedEvent.count({ where: { eventId } })).toBe(1);
    await prisma.branchCopy.delete({ where: { id: branchId } });
  });

  it('keeps the coordinates of the branch for the maps that read them', async () => {
    const branchId = await seedTestBranch(bus, 'coordinates');
    ownedBranchIds.push(branchId);

    const copy = await prisma.branchCopy.findUniqueOrThrow({ where: { id: branchId } });

    expect(copy.latitude.toNumber()).toBe(exampleBranch.latitude);
    expect(copy.longitude.toNumber()).toBe(exampleBranch.longitude);
  });
});
