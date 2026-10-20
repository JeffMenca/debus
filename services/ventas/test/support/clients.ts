import { randomInt, randomUUID } from 'node:crypto';
import { TEST_BRANCH_PREFIX, TEST_RUN } from '@debus/config/test-data';
import type { PrismaService } from '../../src/prisma/prisma.service';

// A NIT no other test run uses, so linking never touches someone else's tickets.
export const testNit = (): string => String(randomInt(100_000_000, 999_999_999));

// Every client copy a test creates is remembered here and removed at the end.
export function testClients(prisma: PrismaService) {
  const created: string[] = [];
  return {
    id(): string {
      const clientId = randomUUID();
      created.push(clientId);
      return clientId;
    },
    // The copy of a client as ProfileUpdated leaves it; its name starts with the prefix of the test data.
    async create(over: { nit?: string | null; fullName?: string } = {}): Promise<string> {
      const clientId = this.id();
      await prisma.clientNit.create({
        data: {
          clientId,
          nit: over.nit === undefined ? testNit() : over.nit,
          fullName: `${TEST_BRANCH_PREFIX}${TEST_RUN} ${over.fullName ?? 'Ana López'}`,
          updatedAt: new Date(),
        },
      });
      return clientId;
    },
    async cleanUp(): Promise<void> {
      await prisma.clientNit.deleteMany({ where: { clientId: { in: created } } });
    },
  };
}
