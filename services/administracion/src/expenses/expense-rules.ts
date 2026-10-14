import {
  type REPAIR_LINE_KINDS,
  type RepairExpenseListQuery,
  escapeLikePattern,
} from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';
import { fromDateOnly } from '../settings/settings-mappers';
import type { ExpenseProblem } from './expense-messages';

type LineKind = (typeof REPAIR_LINE_KINDS)[number];

const toCents = (value: number): number => Math.round(value * 100);

// Sums in cents, so 0.1 + 0.2 is 0.3 and the total always equals the lines the event carries.
export function expenseTotals(lines: { kind: LineKind; amount: number }[]): {
  total: number;
  laborTotal: number;
  partsTotal: number;
} {
  const sum = (kind?: LineKind): number =>
    lines
      .filter((line) => !kind || line.kind === kind)
      .reduce((acc, line) => acc + toCents(line.amount), 0) / 100;
  return { total: sum(), laborTotal: sum('LABOR'), partsTotal: sum('PART') };
}

export function expenseProblem(input: {
  branchId: string;
  bus: { branchId: string; active: boolean } | null;
  categories: { id: string; active: boolean }[];
  categoryIds: string[];
}): ExpenseProblem | null {
  if (!input.bus || input.bus.branchId !== input.branchId) return 'busNotFound';
  if (!input.bus.active) return 'busInactive';
  const byId = new Map(input.categories.map((category) => [category.id, category]));
  for (const id of new Set(input.categoryIds)) {
    const category = byId.get(id);
    if (!category) return 'categoryNotFound';
    if (!category.active) return 'categoryInactive';
  }
  return null;
}

export function repairExpenseListWhere(
  branchId: string,
  query: RepairExpenseListQuery,
): Prisma.RepairExpenseWhereInput {
  return {
    branchId,
    ...(query.busId ? { busId: query.busId } : {}),
    ...(query.categoryId ? { lines: { some: { categoryId: query.categoryId } } } : {}),
    ...(query.from || query.to
      ? {
          serviceDate: {
            ...(query.from ? { gte: fromDateOnly(query.from) } : {}),
            ...(query.to ? { lte: fromDateOnly(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q ? { searchText: { contains: escapeLikePattern(query.q) } } : {}),
  };
}
