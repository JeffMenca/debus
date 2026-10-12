import { TEST_RUN } from '@debus/config/test-data';
import { cleanupStatements } from '@debus/config/test-data-sql';
import type { PrismaService } from '../../src/prisma/prisma.service';

export async function cleanTripTestData(prisma: PrismaService): Promise<void> {
  for (const statement of cleanupStatements({ run: TEST_RUN })) {
    await prisma.$executeRawUnsafe(statement);
  }
}
