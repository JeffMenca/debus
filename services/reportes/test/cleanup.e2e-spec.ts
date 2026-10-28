import { randomUUID } from 'node:crypto';
import { cleanupStatements } from '@debus/config/test-data-sql';
import {
  exampleBus,
  exampleCounterTicketSold,
  exampleDriver,
  exampleRentalCancelled,
  exampleRentalPaid,
  exampleRepairExpenseAdded,
  exampleRoute,
  exampleSettingsUpdated,
  exampleTripCompleted,
} from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { startReportes } from './support/app';
import { seedTestBranch } from './support/branches';
import { cleanReportesTestData } from './support/cleanup';

class Rollback extends Error {}

const countOf = async (prisma: PrismaService, table: string, column: string, id: string) =>
  Number(
    (
      await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = $1::uuid`,
        id,
      )
    )[0]?.n,
  );

describe('cleaning the test data of reportes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bus: Awaited<ReturnType<typeof startReportes>>['bus'];
  const realBranchId = randomUUID();
  const realBusId = randomUUID();

  beforeAll(async () => {
    ({ app, prisma, bus } = await startReportes());
  });
  afterAll(async () => {
    await prisma.branchReportBus.deleteMany({ where: { id: realBusId } });
    await app.close();
  });

  it('removes the read model of the test branches and keeps what belongs to a real one', async () => {
    const branchId = await seedTestBranch(bus, 'limpieza');
    const busId = randomUUID();
    const driverId = randomUUID();
    const tripId = randomUUID();
    await bus.deliver('BusAdded', { ...exampleBus, busId, branchId });
    await bus.deliver('DriverAdded', { ...exampleDriver, driverId, branchId });
    await bus.deliver('TripCompleted', {
      ...exampleTripCompleted,
      tripId,
      branchId,
      busId,
      driverId,
    });
    await bus.deliver('BusAdded', { ...exampleBus, busId: realBusId, branchId: realBranchId });
    const expenseId = randomUUID();
    const ticketId = randomUUID();
    const rentalId = randomUUID();
    await bus.deliver('RepairExpenseAdded', { ...exampleRepairExpenseAdded, expenseId, branchId });
    await bus.deliver('TicketSold', { ...exampleCounterTicketSold, ticketId, branchId });
    await bus.deliver('RentalPaid', { ...exampleRentalPaid, rentalId, branchId });
    await bus.deliver('RentalCancelled', { ...exampleRentalCancelled, rentalId, branchId });
    const originRouteId = randomUUID();
    const destinationRouteId = randomUUID();
    const realRouteId = randomUUID();
    await bus.deliver('RouteCreated', {
      ...exampleRoute,
      routeId: originRouteId,
      originBranchId: branchId,
      destinationBranchId: realBranchId,
    });
    await bus.deliver('RouteCreated', {
      ...exampleRoute,
      routeId: destinationRouteId,
      originBranchId: realBranchId,
      destinationBranchId: branchId,
    });
    await bus.deliver('RouteCreated', {
      ...exampleRoute,
      routeId: realRouteId,
      originBranchId: realBranchId,
      destinationBranchId: realBranchId,
    });
    const realExpenseId = randomUUID();
    await bus.deliver('RepairExpenseAdded', {
      ...exampleRepairExpenseAdded,
      expenseId: realExpenseId,
      branchId: realBranchId,
    });

    await cleanReportesTestData(prisma);

    expect(await prisma.branchReportBus.count({ where: { id: busId } })).toBe(0);
    expect(await prisma.branchReportDriver.count({ where: { id: driverId } })).toBe(0);
    expect(await prisma.branchReportTrip.count({ where: { id: tripId } })).toBe(0);
    expect(await prisma.branchCopy.count({ where: { id: branchId } })).toBe(0);
    expect(await prisma.branchReportBus.count({ where: { id: realBusId } })).toBe(1);
    expect(await countOf(prisma, 'branch_report_repair_lines', 'expense_id', expenseId)).toBe(0);
    expect(await countOf(prisma, 'branch_report_ticket_sales', 'id', ticketId)).toBe(0);
    expect(await countOf(prisma, 'branch_report_rentals', 'id', rentalId)).toBe(0);
    expect(await countOf(prisma, 'branch_report_rental_cancellations', 'rental_id', rentalId)).toBe(
      0,
    );
    expect(await prisma.systemReportRoute.count({ where: { id: originRouteId } })).toBe(0);
    expect(await prisma.systemReportRoute.count({ where: { id: destinationRouteId } })).toBe(0);
    expect(await prisma.systemReportRoute.count({ where: { id: realRouteId } })).toBe(1);
    expect(await countOf(prisma, 'branch_report_repair_lines', 'expense_id', realExpenseId)).toBe(
      2,
    );
    await prisma.systemReportRoute.deleteMany({ where: { id: realRouteId } });
    await prisma.$executeRawUnsafe(
      'DELETE FROM branch_report_repair_lines WHERE expense_id = $1::uuid',
      realExpenseId,
    );
  });

  describe('the rows of a branch that no longer exists in administracion', () => {
    const BRANCH_TABLES = [
      'branch_report_trips',
      'branch_report_ticket_sales',
      'branch_report_buses',
      'branch_report_drivers',
      'branch_report_repair_lines',
      'branch_report_rentals',
    ] as const;
    const orphanBranchId = randomUUID();
    const keptBranchId = randomUUID();
    const rentals: string[] = [];

    // One row of every read model the reports read, as the events leave them, for a branch with no copy.
    async function seedRows(branchId: string, otherEnd: string) {
      const busId = randomUUID();
      const driverId = randomUUID();
      const rentalId = randomUUID();
      rentals.push(rentalId);
      await bus.deliver('BusAdded', { ...exampleBus, busId, branchId });
      await bus.deliver('DriverAdded', { ...exampleDriver, driverId, branchId });
      await bus.deliver('TripCompleted', {
        ...exampleTripCompleted,
        tripId: randomUUID(),
        branchId,
        busId,
        driverId,
      });
      await bus.deliver('RepairExpenseAdded', {
        ...exampleRepairExpenseAdded,
        expenseId: randomUUID(),
        branchId,
      });
      await bus.deliver('TicketSold', {
        ...exampleCounterTicketSold,
        ticketId: randomUUID(),
        branchId,
      });
      await bus.deliver('RentalPaid', { ...exampleRentalPaid, rentalId, branchId });
      await bus.deliver('RentalCancelled', { ...exampleRentalCancelled, rentalId, branchId });
      await bus.deliver('RouteCreated', {
        ...exampleRoute,
        routeId: randomUUID(),
        originBranchId: branchId,
        destinationBranchId: otherEnd,
      });
      await bus.deliver('RouteCreated', {
        ...exampleRoute,
        routeId: randomUUID(),
        originBranchId: otherEnd,
        destinationBranchId: branchId,
      });
    }

    const rowsOf = async (tx: Pick<PrismaService, '$queryRawUnsafe'>, branchId: string) => {
      const counts: Record<string, number> = {};
      for (const table of BRANCH_TABLES) {
        const [row] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE branch_id = $1::uuid`,
          branchId,
        );
        counts[table] = Number(row?.n);
      }
      const [routes] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        'SELECT COUNT(*) AS n FROM system_report_routes WHERE origin_branch_id = $1::uuid OR destination_branch_id = $1::uuid',
        branchId,
      );
      counts.system_report_routes = Number(routes?.n);
      const [cancellations] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*) AS n FROM branch_report_rental_cancellations
         WHERE rental_id IN (SELECT id FROM branch_report_rentals WHERE branch_id = $1::uuid)`,
        branchId,
      );
      counts.branch_report_rental_cancellations = Number(cancellations?.n);
      return counts;
    };
    const everyTableHasRows = (counts: Record<string, number>) =>
      Object.values(counts).every((count) => count > 0);
    const noTableHasRows = (counts: Record<string, number>) =>
      Object.values(counts).every((count) => count === 0);

    // A transaction that is always rolled back: the statements run for real, and nothing stays.
    async function cleanInRollback(
      options: Parameters<typeof cleanupStatements>[0],
      check: (tx: Pick<PrismaService, '$queryRawUnsafe'>) => Promise<void>,
    ) {
      await expect(
        prisma.$transaction(async (tx) => {
          for (const statement of cleanupStatements(options)) await tx.$executeRawUnsafe(statement);
          await check(tx);
          throw new Rollback();
        }),
      ).rejects.toBeInstanceOf(Rollback);
    }

    beforeAll(async () => {
      // The routes of the lost branch go even though the other end still exists.
      await seedRows(orphanBranchId, keptBranchId);
      await seedRows(keptBranchId, keptBranchId);
    });
    afterAll(async () => {
      for (const branchId of [orphanBranchId, keptBranchId]) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM branch_report_rental_cancellations WHERE rental_id = ANY($1::uuid[])`,
          rentals,
        );
        for (const table of BRANCH_TABLES) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM ${table} WHERE branch_id = $1::uuid`,
            branchId,
          );
        }
        await prisma.$executeRawUnsafe(
          'DELETE FROM system_report_routes WHERE origin_branch_id = $1::uuid OR destination_branch_id = $1::uuid',
          branchId,
        );
      }
    });

    it('seeded a row in every table for both branches', async () => {
      expect(everyTableHasRows(await rowsOf(prisma, orphanBranchId))).toBe(true);
      expect(everyTableHasRows(await rowsOf(prisma, keptBranchId))).toBe(true);
    });

    it('are removed from every read model, and those of a branch that still exists stay', async () => {
      await cleanInRollback({ branchIds: [keptBranchId] }, async (tx) => {
        expect(noTableHasRows(await rowsOf(tx, orphanBranchId))).toBe(true);
        expect(everyTableHasRows(await rowsOf(tx, keptBranchId))).toBe(true);
      });
    });

    it.each([
      ['an empty list', []],
      ['no list', null],
    ])(
      'are kept when administracion gave %s, so an unreachable source never empties reportes',
      async (_label, branchIds) => {
        await cleanInRollback({ branchIds }, async (tx) => {
          expect(everyTableHasRows(await rowsOf(tx, orphanBranchId))).toBe(true);
          expect(everyTableHasRows(await rowsOf(tx, keptBranchId))).toBe(true);
        });
      },
    );

    it('refuses an id that is not a UUID instead of putting it in the SQL', () => {
      expect(() => cleanupStatements({ branchIds: ["x'); DROP TABLE users; --"] })).toThrow(
        /is not a UUID/,
      );
    });
  });

  it('keeps the rates whose version still exists in administracion and drops the rest', async () => {
    const alive = randomUUID();
    const gone = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        for (const versionId of [alive, gone]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO branch_report_depreciation_rates (id, depreciation_per_km, effective_from, created_at)
             VALUES ($1::uuid, $2, $3::date, $4::timestamptz)`,
            versionId,
            exampleSettingsUpdated.depreciationPerKm,
            exampleSettingsUpdated.effectiveFrom,
            exampleSettingsUpdated.createdAt,
          );
        }

        for (const statement of cleanupStatements({ settingsVersionIds: [alive] })) {
          await tx.$executeRawUnsafe(statement);
        }

        const left = await tx.$queryRawUnsafe<{ id: string }[]>(
          'SELECT id FROM branch_report_depreciation_rates WHERE id = ANY($1::uuid[])',
          [alive, gone],
        );
        expect(left.map((row) => row.id)).toEqual([alive]);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });

  it('keeps every rate when it was not told which versions exist', async () => {
    const rateId = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO branch_report_depreciation_rates (id, depreciation_per_km, effective_from, created_at)
           VALUES ($1::uuid, 1.5, DATE '2026-10-01', now())`,
          rateId,
        );

        for (const statement of cleanupStatements()) await tx.$executeRawUnsafe(statement);

        expect(
          Number(
            (
              await tx.$queryRawUnsafe<{ n: bigint }[]>(
                'SELECT COUNT(*) AS n FROM branch_report_depreciation_rates WHERE id = $1::uuid',
                rateId,
              )
            )[0]?.n,
          ),
        ).toBe(1);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
  });
});
