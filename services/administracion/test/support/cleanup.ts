import type { PrismaService } from '../../src/prisma/prisma.service';
import { TEST_RUN } from './app';

// Removes only what this test file created, so the local database does not pile up accounts.
export async function cleanTestData(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { contains: `-${TEST_RUN}-` } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.accountLink.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: `Prueba ${TEST_RUN}` } } });
}
