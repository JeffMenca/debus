import { guatemalaDayRange } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import { dayRangeFilter, isBranch } from './branch-entries.sql';
import type { FinanceFilters } from './income-entries.sql';

const GUATEMALA_DAY = Prisma.sql`(t.arrived_at AT TIME ZONE 'America/Guatemala')::date`;

// The fuel and the depreciation of a trip are fixed when it completes, so they belong to the
// Guatemalan day of the arrival.
const tripExpense = (
  concept: 'FUEL' | 'DEPRECIATION',
  amountColumn: 'fuel_cost' | 'depreciation_amount',
  { from, to, branchId }: FinanceFilters,
) => {
  const days = guatemalaDayRange(from, to);
  return Prisma.sql`
    SELECT t.id::text || ${Prisma.raw(`':${concept}'`)} AS id, t.branch_id, ${Prisma.raw(`'${concept}'`)} AS concept,
           ${GUATEMALA_DAY} AS day, COALESCE(t.bus_plate, b.plate) AS bus_plate, t.origin_label,
           t.destination_label, NULL::text AS category_name, NULL::text AS description,
           t.${Prisma.raw(amountColumn)} AS amount
    FROM branch_report_trips t LEFT JOIN branch_report_buses b ON b.id = t.bus_id
    WHERE t.arrived_at IS NOT NULL AND t.deleted_at IS NULL AND t.${Prisma.raw(amountColumn)} > 0
    ${days.gte ? Prisma.sql`AND t.arrived_at >= ${days.gte}` : Prisma.empty}
    ${days.lt ? Prisma.sql`AND t.arrived_at < ${days.lt}` : Prisma.empty}
    ${isBranch('t.branch_id', branchId)}`;
};

// Fuel, depreciation and the repair lines (labor and parts) as one entry each, in the amounts
// above zero. The pay of the drivers is not an expense of these reports and is never stored.
export const expenseEntries = (filters: FinanceFilters) => Prisma.sql`
  ${tripExpense('FUEL', 'fuel_cost', filters)}
  UNION ALL
  ${tripExpense('DEPRECIATION', 'depreciation_amount', filters)}
  UNION ALL
  SELECT l.expense_id::text || ':' || l.line_no AS id, l.branch_id, l.kind AS concept,
         l.service_date AS day, b.plate AS bus_plate, NULL::text AS origin_label,
         NULL::text AS destination_label, l.category_name, l.description, l.amount
  FROM branch_report_repair_lines l LEFT JOIN branch_report_buses b ON b.id = l.bus_id
  WHERE l.amount > 0
  ${dayRangeFilter('l.service_date', filters.from, filters.to)} ${isBranch('l.branch_id', filters.branchId)}`;
