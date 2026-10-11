import { TEST_RUN } from '@debus/config/test-data';
import type { PrismaService } from '../src/prisma/prisma.service';

// Removes only what this test file created, so the local database does not pile up rows.
export async function cleanTestData(prisma: PrismaService): Promise<void> {
  await prisma.sentEmail.deleteMany({ where: { recipient: { contains: `-${TEST_RUN}-` } } });
}
