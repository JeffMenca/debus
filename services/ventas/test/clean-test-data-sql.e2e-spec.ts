import { randomUUID } from 'node:crypto';
import { cleanupStatements } from '@debus/config/test-data-sql';
import { TEST_RUN } from '@debus/config/test-data';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testLabel } from './support/trips';

class Rollback extends Error {}

describe('the SQL of pnpm test:clean in ventas', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const trip = (tx: Prisma.TransactionClient, origin: string, destination: string) => {
    const tripId = randomUUID();
    return tx.trip
      .create({
        data: {
          tripId,
          branchId: randomUUID(),
          routeId: randomUUID(),
          busId: randomUUID(),
          busPlate: 'C482BTX',
          originLabel: origin,
          destinationLabel: destination,
          capacity: 40,
          ticketPrice: 85,
          departureAt: new Date(Date.now() + 86_400_000),
          estimatedArrivalAt: new Date(Date.now() + 100_000_000),
          searchText: '',
        },
      })
      .then(async () => {
        const ticketId = randomUUID();
        await tx.ticket.create({
          data: {
            id: ticketId,
            tripId,
            status: 'PENDING',
            channel: 'ONLINE',
            nit: 'CF',
            buyerName: 'x',
            unitPrice: 85,
            total: 85,
            paidOn: new Date('2026-10-19'),
            seats: { create: [{ tripId, seatNumber: 1 }] },
          },
        });
        await tx.purchase.create({
          data: {
            id: ticketId,
            clientId: randomUUID(),
            tripId,
            seats: [1],
            amount: 85,
            description: 'Boleto',
            paidOn: new Date('2026-10-19'),
            payBy: new Date(Date.now() + 600_000),
            status: 'PENDING',
          },
        });
        return { tripId, ticketId };
      });
  };

  it('removes the trips of the test branches with their tickets, seats and purchases, and only those', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const mine = await trip(tx, testLabel('Quetzaltenango'), testLabel('Guatemala'));
        const toMine = await trip(tx, 'Quetzaltenango', testLabel('Guatemala'));
        const foreign = await trip(tx, 'Quetzaltenango', 'Guatemala');

        for (const statement of cleanupStatements({ run: TEST_RUN })) {
          await tx.$executeRawUnsafe(statement);
        }

        for (const gone of [mine, toMine]) {
          expect(await tx.trip.count({ where: { tripId: gone.tripId } })).toBe(0);
          expect(await tx.ticket.count({ where: { id: gone.ticketId } })).toBe(0);
          expect(await tx.ticketSeat.count({ where: { tripId: gone.tripId } })).toBe(0);
          expect(await tx.purchase.count({ where: { id: gone.ticketId } })).toBe(0);
        }
        expect(await tx.trip.count({ where: { tripId: foreign.tripId } })).toBe(1);
        expect(await tx.ticketSeat.count({ where: { tripId: foreign.tripId } })).toBe(1);
        expect(await tx.purchase.count({ where: { id: foreign.ticketId } })).toBe(1);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it('removes the client copies whose name starts with the test prefix, and only those', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const copy = (fullName: string) => {
          const clientId = randomUUID();
          return tx.clientNit
            .create({ data: { clientId, nit: null, fullName, updatedAt: new Date() } })
            .then(() => clientId);
        };
        const mine = await copy(testLabel('Ana López'));
        const foreign = await copy('Ana López');

        for (const statement of cleanupStatements({ run: TEST_RUN })) {
          await tx.$executeRawUnsafe(statement);
        }

        expect(await tx.clientNit.findUnique({ where: { clientId: mine } })).toBeNull();
        expect(await tx.clientNit.findUnique({ where: { clientId: foreign } })).not.toBeNull();
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
