import { randomInt, randomUUID } from 'node:crypto';
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
    async cleanUp(): Promise<void> {
      await prisma.clientNit.deleteMany({ where: { clientId: { in: created } } });
    },
  };
}
