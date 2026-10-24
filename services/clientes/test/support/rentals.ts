import { randomUUID } from 'node:crypto';
import { todayInGuatemala } from '@debus/contracts';
import type { Prisma } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';

export const RENTAL_TRIP = {
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  passengers: 35,
  distanceKm: 92,
} as const;

// A departure days ahead, so no rule refuses it for being in the past.
export const futureDeparture = (days = 3): string =>
  new Date(Date.now() + days * 86_400_000).toISOString();

// The rental rate the API prices with. When the database has none, one dated long ago is added,
// so it never takes the place of a real one, and removed afterwards.
export async function rentalRate(prisma: PrismaService) {
  const today = todayInGuatemala();
  const current = await prisma.settingsVersionCopy.findFirst({
    where: { effectiveFrom: { lte: new Date(`${today}T00:00:00.000Z`) } },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });
  if (current) return { ratePerKm: current.rentalRatePerKm.toNumber(), remove: async () => {} };
  const id = randomUUID();
  await prisma.settingsVersionCopy.create({
    data: {
      id,
      depreciationPerKm: 1.5,
      rentalRatePerKm: 30,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      createdAt: new Date(),
    },
  });
  return {
    ratePerKm: 30,
    remove: async () => {
      await prisma.settingsVersionCopy.delete({ where: { id } });
    },
  };
}

const FORGET_ANNOUNCED = `
  DELETE FROM outbox
  WHERE type IN ('RentalPaid', 'RentalConfirmed') AND envelope->'payload'->>'rentalId' = ANY($1::text[])`;

// Every rental a test creates, by row or through the API, is removed with the events it queued.
export function testRentals(prisma: PrismaService) {
  const created: string[] = [];
  return {
    async insert(over: Partial<Prisma.RentalUncheckedCreateInput> = {}): Promise<string> {
      const id = over.id ?? randomUUID();
      created.push(id);
      await prisma.rental.create({
        data: {
          id,
          channel: 'COUNTER',
          status: 'REQUESTED',
          branchId: randomUUID(),
          clientId: null,
          nit: 'CF',
          clientName: 'Colegio de prueba',
          ...RENTAL_TRIP,
          departureAt: futureDeparture(),
          ratePerKm: 30,
          estimatedPrice: 2760,
          searchText: '',
          createdById: randomUUID(),
          ...over,
        },
      });
      return id;
    },
    track(id: string): void {
      created.push(id);
    },
    async announced(rentalId: string, type: 'RentalPaid' | 'RentalConfirmed'): Promise<unknown[]> {
      const rows = await prisma.$queryRawUnsafe<{ payload: unknown }[]>(
        `SELECT envelope->'payload' AS payload FROM outbox
         WHERE type = $2 AND envelope->'payload'->>'rentalId' = $1 ORDER BY created_at`,
        rentalId,
        type,
      );
      return rows.map((row) => row.payload);
    },
    async cleanUp(): Promise<void> {
      await prisma.$executeRawUnsafe(FORGET_ANNOUNCED, created);
      await prisma.rental.deleteMany({ where: { id: { in: created } } });
    },
  };
}
