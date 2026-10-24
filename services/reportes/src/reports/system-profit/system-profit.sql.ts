import { type SystemProfitQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import { NO_BRANCH_NAME, branchOrder, isBranch } from '../system-finance/branch-entries.sql';
import { expenseEntries } from '../system-finance/expense-entries.sql';
import { incomeEntries } from '../system-finance/income-entries.sql';

// One row per branch from the very same entries the income and expense reports list, so the profit
// of a branch is always its income minus its expenses. An active branch always appears, with zeros
// if it did not move; an inactive one only when it moved in the period (or a branch that was never
// copied). The sums stay exact (numeric) until the outer query.
const profitRows = (query: SystemProfitQuery) => Prisma.sql`
  WITH income AS (
    SELECT branch_id,
           SUM(amount) FILTER (WHERE channel <> 'RENTAL') AS ticket_income,
           SUM(amount) FILTER (WHERE channel = 'RENTAL') AS rental_income
    FROM (${incomeEntries(query)}) e
    GROUP BY branch_id
  ), expenses AS (
    SELECT branch_id,
           SUM(amount) FILTER (WHERE concept = 'FUEL') AS fuel,
           SUM(amount) FILTER (WHERE concept = 'LABOR') AS labor,
           SUM(amount) FILTER (WHERE concept = 'PART') AS parts,
           SUM(amount) FILTER (WHERE concept = 'DEPRECIATION') AS depreciation
    FROM (${expenseEntries(query)}) e
    GROUP BY branch_id
  ), listed AS (
    SELECT id AS branch_id FROM branches WHERE active ${isBranch('id', query.branchId)}
    UNION SELECT branch_id FROM income
    UNION SELECT branch_id FROM expenses
  )
  SELECT l.branch_id, COALESCE(b.name, ${NO_BRANCH_NAME}::text) AS branch_name,
         COALESCE(i.ticket_income, 0) AS ticket_income, COALESCE(i.rental_income, 0) AS rental_income,
         COALESCE(x.fuel, 0) AS fuel, COALESCE(x.labor, 0) AS labor,
         COALESCE(x.parts, 0) AS parts, COALESCE(x.depreciation, 0) AS depreciation
  FROM listed l
  LEFT JOIN branches b ON b.id = l.branch_id
  LEFT JOIN income i ON i.branch_id = l.branch_id
  LEFT JOIN expenses x ON x.branch_id = l.branch_id`;

const asFigures = Prisma.sql`
  branch_id, branch_name, ticket_income::float8 AS ticket_income,
  rental_income::float8 AS rental_income, fuel::float8 AS fuel, labor::float8 AS labor,
  parts::float8 AS parts, depreciation::float8 AS depreciation`;

const ordered = Prisma.sql`ORDER BY ${branchOrder}`;

export const profitPageQuery = (query: SystemProfitQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT ${asFigures} FROM (${profitRows(query)}) p ${ordered} LIMIT ${take} OFFSET ${skip}`;
};

export const allProfitQuery = (query: SystemProfitQuery) =>
  Prisma.sql`SELECT ${asFigures} FROM (${profitRows(query)}) p ${ordered}`;

export const profitTotalsQuery = (query: SystemProfitQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS branches, COALESCE(SUM(ticket_income), 0)::float8 AS ticket_income,
         COALESCE(SUM(rental_income), 0)::float8 AS rental_income, COALESCE(SUM(fuel), 0)::float8 AS fuel,
         COALESCE(SUM(labor), 0)::float8 AS labor, COALESCE(SUM(parts), 0)::float8 AS parts,
         COALESCE(SUM(depreciation), 0)::float8 AS depreciation
  FROM (${profitRows(query)}) p`;
