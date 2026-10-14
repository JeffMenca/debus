import { TEST_RUN } from '@debus/config/test-data';
import { cleanupStatements } from '@debus/config/test-data-sql';
import type { PrismaService } from '../../src/prisma/prisma.service';

// Removes the test data of this run. When the caller names the branches it created, a copy that
// survives means a test renamed it without the test prefix, which no later cleanup can find.
export async function cleanReportesTestData(
  prisma: PrismaService,
  ownedBranchIds: string[] = [],
): Promise<void> {
  for (const statement of cleanupStatements({ run: TEST_RUN })) {
    await prisma.$executeRawUnsafe(statement);
  }
  const left = await prisma.branchCopy.findMany({
    where: { id: { in: ownedBranchIds } },
    select: { name: true },
  });
  if (left.length > 0) {
    throw new Error(
      `Test branches survived the cleanup; keep TEST_BRANCH_PREFIX in their names: ${left.map((branch) => branch.name).join(', ')}`,
    );
  }
}
