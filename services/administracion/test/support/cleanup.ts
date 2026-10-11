import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import type { PrismaService } from '../../src/prisma/prisma.service';

// Settings versions are immutable history, so only the table owner can remove them, and only with
// the trigger off. The trigger is back on before the transaction commits.
export async function deleteSettingsVersionsOf(
  prisma: PrismaService,
  authorIds: string[],
): Promise<void> {
  if (authorIds.length === 0) return;
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      'ALTER TABLE settings_versions DISABLE TRIGGER settings_versions_immutable',
    ),
    prisma.settingsVersion.deleteMany({ where: { createdById: { in: authorIds } } }),
    prisma.$executeRawUnsafe(
      'ALTER TABLE settings_versions ENABLE TRIGGER settings_versions_immutable',
    ),
  ]);
}

// Removes only what this test file created, so the local database does not pile up accounts.
export async function cleanTestData(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { contains: `-${TEST_RUN}-` } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await deleteSettingsVersionsOf(prisma, ids);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.accountLink.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({
    where: { name: { startsWith: `${TEST_BRANCH_PREFIX}${TEST_RUN}` } },
  });
}
