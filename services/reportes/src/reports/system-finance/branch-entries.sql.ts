import { Prisma } from '../../generated/prisma/client';

export const NO_BRANCH_NAME = 'Sucursal sin datos';

// Inclusive ends; a missing end leaves that side open, so no range means every record. The column
// is trusted SQL written in this package, never user input.
export const dayRangeFilter = (column: string, from?: string, to?: string) => Prisma.sql`
  ${from ? Prisma.sql`AND ${Prisma.raw(column)} >= ${from}::date` : Prisma.empty}
  ${to ? Prisma.sql`AND ${Prisma.raw(column)} <= ${to}::date` : Prisma.empty}`;

export const isBranch = (column: string, branchId?: string) =>
  branchId ? Prisma.sql`AND ${Prisma.raw(column)} = ${branchId}::uuid` : Prisma.empty;

// A branch whose copy has not arrived yet still shows its entries, under a neutral name.
export const entriesWithBranch = (entries: Prisma.Sql) => Prisma.sql`
  SELECT e.*, COALESCE(b.name, ${NO_BRANCH_NAME}::text) AS branch_name
  FROM (${entries}) e LEFT JOIN branches b ON b.id = e.branch_id`;

// Alphabetical without accents, so "Ángeles" comes before "Boca"; the id breaks ties.
export const branchOrder = Prisma.sql`fold_search_text(branch_name), branch_id`;

// The branches in that order and inside each one the latest day first; the id breaks ties so a page
// never repeats or skips a row.
export const branchEntriesOrder = Prisma.sql`ORDER BY ${branchOrder}, day DESC, id`;

// One row per branch with its entries and amount, in the order the report lists the branches.
export const branchGroupsQuery = (entries: Prisma.Sql) => Prisma.sql`
  SELECT branch_id, branch_name, COUNT(*)::int AS entries, SUM(amount)::float8 AS amount
  FROM (${entriesWithBranch(entries)}) e
  GROUP BY branch_id, branch_name
  ORDER BY ${branchOrder}`;
