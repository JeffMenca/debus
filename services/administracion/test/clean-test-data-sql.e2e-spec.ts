import { randomUUID } from 'node:crypto';
import { TEST_RUN, testEmail } from '@debus/config/test-data';
import { cleanupStatements } from '@debus/config/test-data-sql';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';

// The statements that `pnpm test:clean` runs against every local database. They run here inside a
// transaction that is always rolled back, so the real database is never changed.
class Rollback extends Error {}

describe('the SQL of pnpm test:clean', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  // Rolls back whatever `work` did, and still reports why it failed.
  async function inRolledBackTransaction(
    work: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<void>,
  ): Promise<void> {
    let failure: unknown;
    await prisma
      .$transaction(async (tx) => {
        try {
          await work(tx);
        } catch (error) {
          failure = error;
        }
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    if (failure) throw failure;
  }

  it('removes the versions of test authors and orphans, and keeps those of real authors', async () => {
    await inRolledBackTransaction(async (tx) => {
      const real = await tx.user.create({
        data: {
          email: `real-${randomUUID()}@correo.com`,
          fullName: 'Admin real',
          role: 'SYSTEM_ADMIN',
        },
      });
      const test = await tx.user.create({
        data: { email: testEmail('Author'), fullName: 'Admin de prueba', role: 'SYSTEM_ADMIN' },
      });
      const version = (createdById: string) =>
        tx.settingsVersion.create({
          data: {
            depreciationPerKm: 1.25,
            rentalRatePerKm: 12.5,
            effectiveFrom: new Date('2099-01-01'),
            createdById,
          },
        });
      const kept = await version(real.id);
      const byTest = await version(test.id);
      const orphan = await version(randomUUID());

      for (const statement of cleanupStatements()) await tx.$executeRawUnsafe(statement);

      const left = await tx.settingsVersion.findMany({
        where: { id: { in: [kept.id, byTest.id, orphan.id] } },
      });
      expect(left.map((row) => row.id)).toEqual([kept.id]);
      const triggers = await tx.$queryRaw<{ tgenabled: string }[]>`
        SELECT tgenabled::text AS tgenabled FROM pg_trigger WHERE tgname = 'settings_versions_immutable'`;
      expect(triggers.map((row) => row.tgenabled)).toEqual(['O']);
      expect(await tx.user.findUnique({ where: { id: real.id } })).not.toBeNull();
      expect(await tx.user.findUnique({ where: { id: test.id } })).toBeNull();
    });
  });

  it('limits a scoped cleanup to the accounts of that run', async () => {
    await inRolledBackTransaction(async (tx) => {
      const mine = await tx.user.create({
        data: { email: testEmail('Mine'), fullName: 'Mía', role: 'CASHIER' },
      });
      const otherRun = await tx.user.create({
        data: {
          email: `other-${randomUUID().slice(0, 8)}-1-1@debus.test`,
          fullName: 'De otra corrida',
          role: 'CASHIER',
        },
      });

      for (const statement of cleanupStatements({ run: TEST_RUN }))
        await tx.$executeRawUnsafe(statement);

      expect(await tx.user.findUnique({ where: { id: mine.id } })).toBeNull();
      expect(await tx.user.findUnique({ where: { id: otherRun.id } })).not.toBeNull();
    });
  });

  it('keeps a test branch that still has accounts which are not test data', async () => {
    await inRolledBackTransaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          name: 'Prueba 00000000 con personal',
          code: 'ZZZZQ',
          department: 'Guatemala',
          municipality: 'Guatemala',
          address: 'Calle 1',
          phone: '55555555',
          latitude: 14.6,
          longitude: -90.5,
        },
      });
      const staff = await tx.user.create({
        data: {
          email: `staff-${randomUUID()}@correo.com`,
          fullName: 'Personal real',
          role: 'CASHIER',
          branchId: branch.id,
        },
      });

      for (const statement of cleanupStatements()) await tx.$executeRawUnsafe(statement);

      expect(await tx.branch.findUnique({ where: { id: branch.id } })).not.toBeNull();
      expect(await tx.user.findUnique({ where: { id: staff.id } })).not.toBeNull();
    });
  });

  it('refuses a run that is not a TEST_RUN, so nothing can be injected', () => {
    expect(() => cleanupStatements({ run: "x'; DROP TABLE users; --" })).toThrow(/TEST_RUN/);
  });
});
