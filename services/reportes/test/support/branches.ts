import { randomUUID } from 'node:crypto';
import { exampleBranch } from '@debus/contracts';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import type { InMemoryEventBus } from '@debus/messaging';

// Delivers a BranchCreated for a branch named after the test run, so the cleanup finds it.
export async function seedTestBranch(bus: InMemoryEventBus, label: string): Promise<string> {
  const branchId = randomUUID();
  await bus.deliver('BranchCreated', {
    ...exampleBranch,
    branchId,
    code: 'TST',
    name: `${TEST_BRANCH_PREFIX}${TEST_RUN} ${label}`,
  });
  return branchId;
}
