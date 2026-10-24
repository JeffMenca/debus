import { type SystemRepairExpensesQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import { NO_BRANCH_NAME, dayRangeFilter, isBranch } from '../system-finance/branch-entries.sql';

// Every line of every branch that passes the filters; the page, the totals and the groups all
// start here.
const repairLines = (query: SystemRepairExpensesQuery) => Prisma.sql`
  SELECT * FROM branch_report_repair_lines
  WHERE TRUE
  ${dayRangeFilter('service_date', query.from, query.to)}
  ${isBranch('branch_id', query.branchId)}
  ${isBranch('bus_id', query.busId)}`;

// A renamed category takes the name of its most recent line, the same in every row and in the groups.
const withLatestNames = (query: SystemRepairExpensesQuery) => Prisma.sql`
  WITH l AS (${repairLines(query)}),
  names AS (
    SELECT DISTINCT ON (category_id) category_id, category_name FROM l
    ORDER BY category_id, service_date DESC, expense_id DESC, line_no DESC
  )`;

// Categories alphabetically without accents; inside one, the latest service first.
const ordered = Prisma.sql`
  ORDER BY fold_search_text(n.category_name), l.category_id, l.service_date DESC, l.expense_id, l.line_no`;

const linesWithNames = (query: SystemRepairExpensesQuery) => Prisma.sql`
  ${withLatestNames(query)}
  SELECT l.expense_id, l.line_no, l.category_id, n.category_name, l.bus_id, b.plate AS bus_plate,
         l.branch_id, COALESCE(br.name, ${NO_BRANCH_NAME}::text) AS branch_name, l.service_date,
         l.kind, l.description, l.amount::float8 AS amount
  FROM l
  JOIN names n ON n.category_id = l.category_id
  LEFT JOIN branch_report_buses b ON b.id = l.bus_id
  LEFT JOIN branches br ON br.id = l.branch_id`;

export const repairPageQuery = (query: SystemRepairExpensesQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`${linesWithNames(query)} ${ordered} LIMIT ${take} OFFSET ${skip}`;
};

export const allRepairsQuery = (query: SystemRepairExpensesQuery) =>
  Prisma.sql`${linesWithNames(query)} ${ordered}`;

export const repairTotalsQuery = (query: SystemRepairExpensesQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS lines, COUNT(DISTINCT expense_id)::int AS expenses,
         COALESCE(SUM(amount), 0)::float8 AS amount
  FROM (${repairLines(query)}) l`;

export const repairCategoriesQuery = (query: SystemRepairExpensesQuery) => Prisma.sql`
  ${withLatestNames(query)}
  SELECT l.category_id, n.category_name, COUNT(*)::int AS lines, SUM(l.amount)::float8 AS amount
  FROM l JOIN names n ON n.category_id = l.category_id
  GROUP BY l.category_id, n.category_name
  ORDER BY fold_search_text(n.category_name), l.category_id`;

// The plate the PDF prints for the bus that was chosen.
export const busPlateQuery = (busId: string) => Prisma.sql`
  SELECT plate FROM branch_report_buses WHERE id = ${busId}::uuid`;
