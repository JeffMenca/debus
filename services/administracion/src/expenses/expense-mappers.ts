import type { RepairExpense, RepairExpenseAddedPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';
import { toDateOnly } from '../settings/settings-mappers';

export const WITH_LINES = {
  lines: { include: { category: { select: { name: true } } }, orderBy: { position: 'asc' } },
} satisfies Prisma.RepairExpenseInclude;
export type RepairExpenseRow = Prisma.RepairExpenseGetPayload<{ include: typeof WITH_LINES }>;

// The lines are sorted here too, so a row that was not read in order still comes out in order.
const toLines = (row: RepairExpenseRow) =>
  [...row.lines]
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      categoryId: line.categoryId,
      categoryName: line.category.name,
      kind: line.kind,
      description: line.description,
      amount: line.amount.toNumber(),
    }));

export function toRepairExpense(row: RepairExpenseRow): RepairExpense {
  return {
    id: row.id,
    branchId: row.branchId,
    busId: row.busId,
    busPlate: row.busPlate,
    serviceDate: toDateOnly(row.serviceDate),
    total: row.total.toNumber(),
    laborTotal: row.laborTotal.toNumber(),
    partsTotal: row.partsTotal.toNumber(),
    lines: toLines(row),
  };
}

export function toRepairExpenseAddedPayload(row: RepairExpenseRow): RepairExpenseAddedPayload {
  return {
    expenseId: row.id,
    branchId: row.branchId,
    busId: row.busId,
    serviceDate: toDateOnly(row.serviceDate),
    total: row.total.toNumber(),
    lines: toLines(row),
  };
}
