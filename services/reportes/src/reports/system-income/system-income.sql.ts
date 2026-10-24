import { type SystemIncomeQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import {
  branchEntriesOrder,
  branchGroupsQuery,
  entriesWithBranch,
} from '../system-finance/branch-entries.sql';
import { incomeEntries } from '../system-finance/income-entries.sql';

const incomeRows = (query: SystemIncomeQuery) => Prisma.sql`
  SELECT id, branch_id, branch_name, channel, day, origin_label, destination_label, client_name,
         quantity, amount::float8 AS amount
  FROM (${entriesWithBranch(incomeEntries(query))}) e`;

export const incomePageQuery = (query: SystemIncomeQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`${incomeRows(query)} ${branchEntriesOrder} LIMIT ${take} OFFSET ${skip}`;
};

export const allIncomeQuery = (query: SystemIncomeQuery) =>
  Prisma.sql`${incomeRows(query)} ${branchEntriesOrder}`;

export const incomeTotalsQuery = (query: SystemIncomeQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS entries, COALESCE(SUM(amount), 0)::float8 AS amount,
         COALESCE(SUM(amount) FILTER (WHERE channel = 'ONLINE'), 0)::float8 AS online_tickets,
         COALESCE(SUM(amount) FILTER (WHERE channel = 'COUNTER'), 0)::float8 AS counter_tickets,
         COALESCE(SUM(amount) FILTER (WHERE channel = 'RENTAL'), 0)::float8 AS rentals
  FROM (${incomeEntries(query)}) e`;

export const incomeGroupsQuery = (query: SystemIncomeQuery) =>
  branchGroupsQuery(incomeEntries(query));
