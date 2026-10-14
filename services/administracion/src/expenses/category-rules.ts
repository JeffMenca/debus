import { type ExpenseCategoryListQuery, escapeLikePattern } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

const STATUS_WHERE = { active: { active: true }, inactive: { active: false }, all: {} } as const;

export function categoryListWhere(
  query: ExpenseCategoryListQuery,
): Prisma.ExpenseCategoryWhereInput {
  return {
    ...STATUS_WHERE[query.status],
    ...(query.q ? { searchText: { contains: escapeLikePattern(query.q) } } : {}),
  };
}
