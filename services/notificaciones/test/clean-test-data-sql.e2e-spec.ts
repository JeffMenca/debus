import { randomUUID } from 'node:crypto';
import { TEST_RUN, testEmail } from '@debus/config/test-data';
import { cleanupStatements } from '@debus/config/test-data-sql';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

class Rollback extends Error {}

// The statements name the public schema, so this runs there, inside a transaction that is rolled
// back: nothing it writes or deletes is ever committed.
let app: INestApplication;

beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('the SQL of pnpm test:clean in notificaciones', () => {
  it('removes the emails and the copies of test accounts, and only those', async () => {
    const mine = testEmail('copia');
    const foreign = `persona-${randomUUID()}@correo-real.example`;
    const copies = (email: string) => ({
      ticket: {
        ticketId: randomUUID(),
        tripId: randomUUID(),
        email,
        buyerName: 'Ana',
        channel: 'ONLINE',
        originLabel: 'A',
        destinationLabel: 'B',
        departureAt: new Date(),
        seats: [1],
        total: 85,
      },
      driver: {
        driverId: randomUUID(),
        branchId: randomUUID(),
        email,
        fullName: 'Luis',
        licenseExpiresOn: new Date('2026-11-01'),
        active: true,
        version: 1,
      },
      admin: {
        userId: randomUUID(),
        branchId: null,
        email,
        fullName: 'Marta',
        active: true,
        version: 0,
      },
      sent: {
        eventId: 'e',
        dedupeKey: `k-${randomUUID()}`,
        recipient: email,
        template: 'TICKET_SOLD',
        status: 'SENT' as const,
      },
    });

    await expect(
      app.get(PrismaService).$transaction(async (tx) => {
        for (const email of [mine, foreign]) {
          const rows = copies(email);
          await tx.ticketCopy.create({ data: rows.ticket });
          await tx.driverLicense.create({ data: rows.driver });
          await tx.branchAdmin.create({ data: rows.admin });
          await tx.sentEmail.create({ data: rows.sent });
        }

        for (const statement of cleanupStatements({ run: TEST_RUN })) {
          await tx.$executeRawUnsafe(statement);
        }

        for (const table of [tx.ticketCopy, tx.driverLicense, tx.branchAdmin] as const) {
          const remaining = await (table as typeof tx.ticketCopy).findMany({
            where: { email: { in: [mine, foreign] } },
            select: { email: true },
          });
          expect(remaining.map((row) => row.email)).toEqual([foreign]);
        }
        const sent = await tx.sentEmail.findMany({
          where: { recipient: { in: [mine, foreign] } },
          select: { recipient: true },
        });
        expect(sent.map((row) => row.recipient)).toEqual([foreign]);
        throw new Rollback();
      }),
    ).rejects.toThrow(Rollback);
  });
});
