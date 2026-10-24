import { type SystemExpensesQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import {
  branchEntriesOrder,
  branchGroupsQuery,
  entriesWithBranch,
} from '../system-finance/branch-entries.sql';
import { expenseEntries } from '../system-finance/expense-entries.sql';

const expenseRows = (query: SystemExpensesQuery) => Prisma.sql`
  SELECT id, branch_id, branch_name, concept, day, bus_plate, origin_label, destination_label,
         category_name, description, amount::float8 AS amount
  FROM (${entriesWithBranch(expenseEntries(query))}) e`;

export const expensesPageQuery = (query: SystemExpensesQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`${expenseRows(query)} ${branchEntriesOrder} LIMIT ${take} OFFSET ${skip}`;
};

export const allExpensesQuery = (query: SystemExpensesQuery) =>
  Prisma.sql`${expenseRows(query)} ${branchEntriesOrder}`;

export const expensesTotalsQuery = (query: SystemExpensesQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS entries, COALESCE(SUM(amount), 0)::float8 AS amount,
         COALESCE(SUM(amount) FILTER (WHERE concept = 'FUEL'), 0)::float8 AS fuel,
         COALESCE(SUM(amount) FILTER (WHERE concept = 'DEPRECIATION'), 0)::float8 AS depreciation,
         COALESCE(SUM(amount) FILTER (WHERE concept = 'LABOR'), 0)::float8 AS labor,
         COALESCE(SUM(amount) FILTER (WHERE concept = 'PART'), 0)::float8 AS parts
  FROM (${expenseEntries(query)}) e`;

export const expensesGroupsQuery = (query: SystemExpensesQuery) =>
  branchGroupsQuery(expenseEntries(query));
