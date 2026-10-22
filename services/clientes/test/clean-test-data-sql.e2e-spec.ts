import { randomUUID } from 'node:crypto';
import { TEST_RUN, testEmail } from '@debus/config/test-data';
import { cleanupStatements } from '@debus/config/test-data-sql';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';

class Rollback extends Error {}

describe('the SQL of pnpm test:clean in clientes', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('removes the profiles of the test accounts with their wallet and movements, and only those', async () => {
    const mine = randomUUID();
    const foreign = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        const profile = (userId: string, email: string) =>
          tx.clientProfile.create({
            data: {
              userId,
              email,
              fullName: 'Cliente de prueba',
              role: 'CLIENT',
              wallet: { create: { balance: 50 } },
            },
          });
        await profile(mine, testEmail('cliente'));
        await profile(foreign, `cliente-${randomUUID()}@clientes-reales.example`);
        await tx.walletMovement.create({
          data: {
            id: randomUUID(),
            clientId: mine,
            kind: 'TOP_UP',
            amount: 50,
            balanceAfter: 50,
            description: 'Recarga de saldo',
            occurredOn: new Date('2026-10-19'),
            idempotencyKey: randomUUID(),
            fingerprint: 'TOP_UP|5000|2026-10-19|',
          },
        });

        for (const statement of cleanupStatements({ run: TEST_RUN })) {
          await tx.$executeRawUnsafe(statement);
        }

        expect(await tx.clientProfile.findUnique({ where: { userId: mine } })).toBeNull();
        expect(await tx.wallet.findUnique({ where: { clientId: mine } })).toBeNull();
        expect(await tx.walletMovement.count({ where: { clientId: mine } })).toBe(0);
        expect(await tx.clientProfile.findUnique({ where: { userId: foreign } })).not.toBeNull();
        expect(await tx.wallet.findUnique({ where: { clientId: foreign } })).not.toBeNull();
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it('removes the rentals of the test accounts and those a test admin took at the counter', async () => {
    const admin = randomUUID();
    const client = randomUUID();
    const foreignAdmin = randomUUID();
    const rental = (over: Record<string, unknown>) => ({
      id: randomUUID(),
      channel: 'COUNTER' as const,
      status: 'REQUESTED' as const,
      branchId: randomUUID(),
      clientId: null,
      nit: 'CF',
      clientName: 'Colegio de prueba',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: new Date('2026-12-01T13:00:00.000Z'),
      passengers: 35,
      distanceKm: 92,
      ratePerKm: 30,
      estimatedPrice: 2760,
      searchText: '',
      createdById: foreignAdmin,
      ...over,
    });
    const byTestAdmin = rental({ createdById: admin });
    const withTestEmail = rental({ email: testEmail('colegio') });
    const online = rental({ channel: 'ONLINE', clientId: client, createdById: client });
    const foreign = rental({ email: 'reservas@colegio-real.example' });
    await expect(
      prisma.$transaction(async (tx) => {
        for (const [userId, role] of [
          [admin, 'BRANCH_ADMIN'],
          [client, 'CLIENT'],
        ] as const) {
          await tx.clientProfile.create({
            data: { userId, email: testEmail('alquiler'), fullName: 'Prueba', role },
          });
        }
        for (const data of [byTestAdmin, withTestEmail, online, foreign]) {
          await tx.rental.create({ data });
        }

        for (const statement of cleanupStatements({ run: TEST_RUN })) {
          await tx.$executeRawUnsafe(statement);
        }

        const left = await tx.rental.findMany({
          where: { id: { in: [byTestAdmin, withTestEmail, online, foreign].map((r) => r.id) } },
        });
        expect(left.map((r) => r.id)).toEqual([foreign.id]);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
