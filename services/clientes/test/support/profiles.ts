import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import type { PrismaService } from '../../src/prisma/prisma.service';

// Every profile a test creates is remembered here and removed with its wallet and movements.
export function testProfiles(prisma: PrismaService) {
  const created: string[] = [];
  return {
    async create(over: { balance?: number; nit?: string | null } = {}): Promise<string> {
      const userId = randomUUID();
      created.push(userId);
      await prisma.clientProfile.create({
        data: {
          userId,
          email: testEmail('cliente'),
          fullName: 'Cliente de prueba',
          role: 'CLIENT',
          dpi: '2734519200901',
          phone: '55123489',
          nit: over.nit ?? null,
          wallet: { create: { balance: over.balance ?? 0 } },
        },
      });
      return userId;
    },
    track(userId: string): void {
      created.push(userId);
    },
    async cleanUp(): Promise<void> {
      await prisma.clientProfile.deleteMany({ where: { userId: { in: created } } });
    },
  };
}
