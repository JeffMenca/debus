import { type BranchRepairExpensesQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';

// Every line of the branch that passes the filters; the page, the totals and the groups all start here.
const repairLines = (branchId: string, query: BranchRepairExpensesQuery) => Prisma.sql`
  SELECT * FROM branch_report_repair_lines
  WHERE branch_id = ${branchId}::uuid
  ${query.from ? Prisma.sql`AND service_date >= ${query.from}::date` : Prisma.empty}
  ${query.to ? Prisma.sql`AND service_date <= ${query.to}::date` : Prisma.empty}
  ${query.busId ? Prisma.sql`AND bus_id = ${query.busId}::uuid` : Prisma.empty}
  ${query.categoryId ? Prisma.sql`AND category_id = ${query.categoryId}::uuid` : Prisma.empty}`;

// One bus per row; a bus with no copy in the read model comes back with empty names.
const busesWithSpending = (branchId: string, query: BranchRepairExpensesQuery) => Prisma.sql`
  SELECT l.bus_id AS id, b.plate, b.brand, b.model,
         COUNT(DISTINCT l.expense_id)::int AS expenses, SUM(l.amount)::float8 AS total
  FROM (${repairLines(branchId, query)}) l
  LEFT JOIN branch_report_buses b ON b.id = l.bus_id
  GROUP BY l.bus_id, b.plate, b.brand, b.model`;

const bySpending = Prisma.sql`ORDER BY total DESC, id`;

export const repairPageQuery = (branchId: string, query: BranchRepairExpensesQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    ${busesWithSpending(branchId, query)} ${bySpending} LIMIT ${take} OFFSET ${skip}`;
};

export const allRepairsQuery = (branchId: string, query: BranchRepairExpensesQuery) =>
  Prisma.sql`${busesWithSpending(branchId, query)} ${bySpending}`;

export const repairTotalsQuery = (branchId: string, query: BranchRepairExpensesQuery) => Prisma.sql`
  SELECT COUNT(DISTINCT bus_id)::int AS buses, COUNT(DISTINCT expense_id)::int AS expenses,
         COALESCE(SUM(amount), 0)::float8 AS total
  FROM (${repairLines(branchId, query)}) l`;

// A renamed category takes the name of its most recent expense, the same in every bus and in the groups.
const withLatestNames = (branchId: string, query: BranchRepairExpensesQuery) => Prisma.sql`
  WITH l AS (${repairLines(branchId, query)}),
  names AS (
    SELECT DISTINCT ON (category_id) category_id, category_name FROM l
    ORDER BY category_id, service_date DESC, expense_id DESC, line_no DESC
  )`;

// The categories of the given buses, or of every filtered bus when none are given (the PDF).
export const repairCategoriesQuery = (
  branchId: string,
  query: BranchRepairExpensesQuery,
  busIds?: string[],
) => Prisma.sql`
  ${withLatestNames(branchId, query)}
  SELECT l.bus_id, l.category_id, n.category_name, COUNT(*)::int AS lines,
         SUM(l.amount)::float8 AS amount
  FROM l JOIN names n ON n.category_id = l.category_id
  ${busIds ? Prisma.sql`WHERE l.bus_id = ANY(${busIds}::uuid[])` : Prisma.empty}
  GROUP BY l.bus_id, l.category_id, n.category_name`;

export const repairGroupsQuery = (branchId: string, query: BranchRepairExpensesQuery) => Prisma.sql`
  ${withLatestNames(branchId, query)}
  SELECT l.category_id, n.category_name, COUNT(*)::int AS lines, SUM(l.amount)::float8 AS amount
  FROM l JOIN names n ON n.category_id = l.category_id
  GROUP BY l.category_id, n.category_name
  ORDER BY amount DESC, n.category_name, l.category_id`;

// The names the PDF prints for the bus and the category that were chosen.
export const filterLabelsQuery = (branchId: string, query: BranchRepairExpensesQuery) => Prisma.sql`
  SELECT
    ${
      query.busId
        ? Prisma.sql`(SELECT plate FROM branch_report_buses
                      WHERE id = ${query.busId}::uuid AND branch_id = ${branchId}::uuid)`
        : Prisma.sql`NULL::text`
    } AS bus_plate,
    ${
      query.categoryId
        ? Prisma.sql`(SELECT category_name FROM branch_report_repair_lines
                      WHERE category_id = ${query.categoryId}::uuid AND branch_id = ${branchId}::uuid
                      ORDER BY service_date DESC, expense_id DESC, line_no DESC LIMIT 1)`
        : Prisma.sql`NULL::text`
    } AS category_name`;
