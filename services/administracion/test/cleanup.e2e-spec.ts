import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { cleanTestData, deleteSettingsVersionsOf } from './support/cleanup';

describe('test data cleanup', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const strangerId = randomUUID();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await deleteSettingsVersionsOf(prisma, [strangerId]);
      await cleanTestData(prisma);
    } finally {
      await app?.close();
    }
  });

  const addVersion = (createdById: string) =>
    prisma.settingsVersion.create({
      data: {
        depreciationPerKm: 1.1,
        rentalRatePerKm: 11,
        effectiveFrom: new Date('2099-01-01'),
        createdById,
      },
    });

  it('removes the immutable settings versions written by test users and nobody else', async () => {
    const author = await prisma.user.create({
      data: { email: testEmail('Author'), fullName: 'Persona de prueba', role: 'SYSTEM_ADMIN' },
    });
    const mine = await addVersion(author.id);
    const stranger = await addVersion(strangerId);

    await cleanTestData(prisma);

    expect(await prisma.settingsVersion.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await prisma.settingsVersion.findUnique({ where: { id: stranger.id } })).not.toBeNull();
  });

  it('leaves the immutability trigger enabled', async () => {
    const version = await addVersion(strangerId);

    await expect(
      prisma.$executeRaw`DELETE FROM settings_versions WHERE id = ${version.id}::uuid`,
    ).rejects.toThrow(/cannot be changed/);
  });
});
