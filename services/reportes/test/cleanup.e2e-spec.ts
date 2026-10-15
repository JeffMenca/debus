import { randomUUID } from 'node:crypto';
import { cleanupStatements } from '@debus/config/test-data-sql';
import {
  exampleBus,
  exampleCounterTicketSold,
  exampleDriver,
  exampleRentalPaid,
  exampleRepairExpenseAdded,
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
    expect(await countOf(prisma, 'branch_report_repair_lines', 'expense_id', realExpenseId)).toBe(
      2,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM branch_report_repair_lines WHERE expense_id = $1::uuid',
      realExpenseId,
    );
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
