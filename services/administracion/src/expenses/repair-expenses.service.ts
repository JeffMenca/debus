import {
  type CreateRepairExpenseRequest,
  type RepairExpense,
  type RepairExpenseListQuery,
  type RepairExpensePage,
  pageArgs,
  toPage,
} from '@debus/contracts';
import { type Identity, isUniqueViolation, requireBranch } from '@debus/server';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminEvents } from '../common/admin-events';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fromDateOnly } from '../settings/settings-mappers';
import { EXPENSE_MESSAGES } from './expense-messages';
import { expenseProblem, expenseTotals, repairExpenseListWhere } from './expense-rules';
import {
  WITH_LINES,
  type RepairExpenseRow,
  toRepairExpense,
  toRepairExpenseAddedPayload,
} from './expense-mappers';

// The newest service first; the id breaks ties, so an expense never shows up on two pages or on none.
const NEWEST_FIRST: Prisma.RepairExpenseOrderByWithRelationInput[] = [
  { serviceDate: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

@Injectable()
export class RepairExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AdminEvents,
  ) {}

  async list(branchId: string, query: RepairExpenseListQuery): Promise<RepairExpensePage> {
    const where = repairExpenseListWhere(branchId, query);
    const [rows, total, sum] = await this.prisma.$transaction([
      this.prisma.repairExpense.findMany({
        where,
        include: WITH_LINES,
        orderBy: NEWEST_FIRST,
        ...pageArgs(query),
      }),
      this.prisma.repairExpense.count({ where }),
      this.prisma.repairExpense.aggregate({ where, _sum: { total: true } }),
    ]);
    return {
      ...toPage(rows.map(toRepairExpense), total, query),
      summary: { total: sum._sum.total?.toNumber() ?? 0 },
    };
  }

  async get(branchId: string, id: string): Promise<RepairExpense> {
    const row = await this.prisma.repairExpense.findFirst({
      where: { id, branchId },
      include: WITH_LINES,
    });
    if (!row) throw new NotFoundException(EXPENSE_MESSAGES.expenseNotFound);
    return toRepairExpense(row);
  }

  // The web chooses the id, so sending the same expense again answers with the first one.
  async create(
    actor: Identity,
    input: CreateRepairExpenseRequest,
    correlationId?: string,
  ): Promise<{ expense: RepairExpense; created: boolean }> {
    const branchId = requireBranch(actor);
    const saved = await this.findSaved(branchId, input.id);
    if (saved) return { expense: toRepairExpense(saved), created: false };

    const bus = await this.prisma.busCopy.findUnique({ where: { id: input.busId } });
    const categoryIds = input.lines.map((line) => line.categoryId);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, active: true },
    });
    const problem = expenseProblem({ branchId, bus, categories, categoryIds });
    if (problem || !bus) {
      throw new ConflictException(EXPENSE_MESSAGES[problem ?? 'busNotFound']);
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const expense = await tx.repairExpense.create({
          data: {
            id: input.id,
            branchId,
            busId: bus.id,
            busPlate: bus.plate,
            serviceDate: fromDateOnly(input.serviceDate),
            ...expenseTotals(input.lines),
            createdById: actor.userId,
            lines: { create: input.lines.map((line, position) => ({ ...line, position })) },
          },
          include: WITH_LINES,
        });
        await this.events.repairExpenseAdded(
          tx,
          toRepairExpenseAddedPayload(expense),
          correlationId,
        );
        return expense;
      });
      await this.events.flush();
      return { expense: toRepairExpense(row), created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another request with the same id won the race: its expense is the one that counts.
      const winner = await this.findSaved(branchId, input.id);
      if (!winner) throw error;
      return { expense: toRepairExpense(winner), created: false };
    }
  }

  // An id that exists in another branch is hidden as if it did not exist.
  private async findSaved(branchId: string, id: string): Promise<RepairExpenseRow | null> {
    const row = await this.prisma.repairExpense.findUnique({
      where: { id },
      include: WITH_LINES,
    });
    if (row && row.branchId !== branchId) {
      throw new NotFoundException(EXPENSE_MESSAGES.expenseNotFound);
    }
    return row;
  }
}
