import { randomUUID } from 'node:crypto';
import { cleanupStatements } from '@debus/config/test-data-sql';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

class Rollback extends Error {}

describe('the SQL of pnpm test:clean in a service that only keeps copies', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('removes the settings copies whose version no longer exists in administracion', async () => {
    const alive = randomUUID();
    const gone = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        const copy = (id: string) =>
          tx.settingsVersionCopy.create({
            data: {
              id,
              depreciationPerKm: 1.5,
              rentalRatePerKm: 15,
              effectiveFrom: new Date('2099-01-01'),
              createdAt: new Date(),
            },
          });
        await copy(alive);
        await copy(gone);

        for (const statement of cleanupStatements({ settingsVersionIds: [alive] })) {
          await tx.$executeRawUnsafe(statement);
        }

        const left = await tx.settingsVersionCopy.findMany({
          where: { id: { in: [alive, gone] } },
        });
        expect(left.map((row) => row.id)).toEqual([alive]);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it('keeps every copy when it was not told which versions exist', async () => {
    const copyId = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.settingsVersionCopy.create({
          data: {
            id: copyId,
            depreciationPerKm: 1.5,
            rentalRatePerKm: 15,
            effectiveFrom: new Date('2099-01-01'),
            createdAt: new Date(),
          },
        });

        for (const statement of cleanupStatements()) await tx.$executeRawUnsafe(statement);

        expect(await tx.settingsVersionCopy.findUnique({ where: { id: copyId } })).not.toBeNull();
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it('rejects an id that is not a UUID', () => {
    expect(() => cleanupStatements({ settingsVersionIds: ["1'); DROP TABLE x; --"] })).toThrow(
      /UUID/,
    );
  });

  it('removes the requests of test people still waiting for a bus, and only those', async () => {
    const request = (id: string, clientName: string) => ({
      id,
      branchId: randomUUID(),
      clientName,
      nit: 'CF',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: new Date(Date.now() + 86_400_000),
      passengers: 30,
      distanceKm: 92,
      price: 1500,
    });
    const test = randomUUID();
    const real = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.rentalRequest.createMany({
          data: [request(test, 'Colegio de prueba'), request(real, 'Ana Méndez')],
        });
        for (const statement of cleanupStatements()) await tx.$executeRawUnsafe(statement);
        const left = await tx.rentalRequest.findMany({ where: { id: { in: [test, real] } } });
        expect(left.map((row) => row.id)).toEqual([real]);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
