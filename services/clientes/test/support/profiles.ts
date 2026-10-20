import { randomUUID } from 'node:crypto';
import { testEmail } from '@debus/config/test-data';
import type { PrismaService } from '../../src/prisma/prisma.service';

const ANNOUNCED = `
  SELECT envelope->'payload' AS payload FROM outbox
  WHERE type = 'ProfileUpdated' AND envelope->'payload'->>'clientId' = $1
  ORDER BY created_at`;
const FORGET_ANNOUNCED = `
  DELETE FROM outbox
  WHERE type = 'ProfileUpdated' AND envelope->'payload'->>'clientId' = ANY($1::text[])`;

// Every profile a test creates is remembered here and removed with its wallet, its movements and
// the ProfileUpdated events it queued.
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
    async announced(userId: string): Promise<Record<string, unknown>[]> {
      const rows = await prisma.$queryRawUnsafe<{ payload: Record<string, unknown> }[]>(
        ANNOUNCED,
        userId,
      );
      return rows.map((row) => row.payload);
    },
    async cleanUp(): Promise<void> {
      await prisma.$executeRawUnsafe(FORGET_ANNOUNCED, created);
      await prisma.clientProfile.deleteMany({ where: { userId: { in: created } } });
    },
  };
}
