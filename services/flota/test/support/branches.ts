import { randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import type { PrismaService } from '../../src/prisma/prisma.service';

export async function seedTestBranch(
  prisma: PrismaService,
  label: string,
  active = true,
): Promise<string> {
  const id = randomUUID();
  await prisma.branchCopy.create({
    data: {
      id,
      code: 'TST',
      name: `${TEST_BRANCH_PREFIX}${TEST_RUN} ${label}`,
      active,
      version: 1,
    },
  });
  return id;
}
