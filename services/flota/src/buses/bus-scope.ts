import { escapeLikePattern } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

const withoutSeparators = (term: string) => term.replace(/[\s-]/g, '');

// The plate is stored without hyphens but shown with one, so "c-482btx" has to find "c482btx" too.
export function busSearchWhere(q: string | undefined): Prisma.BusWhereInput {
  if (!q) return {};
  const terms = [...new Set([q, withoutSeparators(q)])];
  const conditions = terms.map((term) => ({ searchText: { contains: escapeLikePattern(term) } }));
  return conditions.length === 1 ? (conditions[0] ?? {}) : { OR: conditions };
}
