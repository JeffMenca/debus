import { type BranchTicketIncomeQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';

// Every sale of the branch that passes the filters, by the day it was paid. A deleted trip refunds
// its tickets, so they are no longer income (wallet or counter alike), even if the sale arrived late.
const salesOfBranch = (branchId: string, query: BranchTicketIncomeQuery) => Prisma.sql`
  SELECT s.* FROM branch_report_ticket_sales s
  WHERE s.branch_id = ${branchId}::uuid
    AND NOT EXISTS (SELECT 1 FROM branch_report_trips t WHERE t.id = s.trip_id AND t.deleted_at IS NOT NULL)
  ${query.from ? Prisma.sql`AND s.paid_on >= ${query.from}::date` : Prisma.empty}
  ${query.to ? Prisma.sql`AND s.paid_on <= ${query.to}::date` : Prisma.empty}
  ${query.routeId ? Prisma.sql`AND s.route_id = ${query.routeId}::uuid` : Prisma.empty}
  ${query.busId ? Prisma.sql`AND s.bus_id = ${query.busId}::uuid` : Prisma.empty}`;

// One trip per row; a trip whose bus has no copy in the read model comes back without a plate.
const tripsWithIncome = (branchId: string, query: BranchTicketIncomeQuery) => Prisma.sql`
  SELECT s.trip_id, s.departure_at, s.route_id, s.origin_label, s.destination_label, s.bus_id,
         b.plate AS bus_plate,
         SUM(s.seats)::int AS tickets,
         COALESCE(SUM(s.seats) FILTER (WHERE s.channel = 'ONLINE'), 0)::int AS online_tickets,
         COALESCE(SUM(s.seats) FILTER (WHERE s.channel = 'COUNTER'), 0)::int AS counter_tickets,
         SUM(s.total)::float8 AS income
  FROM (${salesOfBranch(branchId, query)}) s
  LEFT JOIN branch_report_buses b ON b.id = s.bus_id
  GROUP BY s.trip_id, s.departure_at, s.route_id, s.origin_label, s.destination_label, s.bus_id, b.plate`;

const latestFirst = Prisma.sql`ORDER BY departure_at DESC, trip_id`;

export const ticketIncomePageQuery = (branchId: string, query: BranchTicketIncomeQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    ${tripsWithIncome(branchId, query)} ${latestFirst} LIMIT ${take} OFFSET ${skip}`;
};

export const allTicketIncomeQuery = (branchId: string, query: BranchTicketIncomeQuery) =>
  Prisma.sql`${tripsWithIncome(branchId, query)} ${latestFirst}`;

export const ticketIncomeTotalsQuery = (branchId: string, query: BranchTicketIncomeQuery) =>
  Prisma.sql`
    SELECT COUNT(DISTINCT trip_id)::int AS trips, COALESCE(SUM(seats), 0)::int AS tickets,
           COALESCE(SUM(total), 0)::float8 AS income
    FROM (${salesOfBranch(branchId, query)}) s`;

// Routes are bounded by the branch: one per destination it serves.
export const ticketIncomeGroupsQuery = (branchId: string, query: BranchTicketIncomeQuery) =>
  Prisma.sql`
    SELECT route_id, origin_label, destination_label, SUM(seats)::int AS tickets,
           SUM(total)::float8 AS income
    FROM (${salesOfBranch(branchId, query)}) s
    GROUP BY route_id, origin_label, destination_label
    ORDER BY income DESC, route_id`;

// The names the PDF prints for the route and the bus that were chosen.
export const filterLabelsQuery = (branchId: string, query: BranchTicketIncomeQuery) => Prisma.sql`
  SELECT
    ${
      query.routeId
        ? Prisma.sql`(SELECT origin_label FROM branch_report_ticket_sales
                      WHERE route_id = ${query.routeId}::uuid AND branch_id = ${branchId}::uuid
                      ORDER BY sold_at DESC LIMIT 1)`
        : Prisma.sql`NULL::text`
    } AS origin_label,
    ${
      query.routeId
        ? Prisma.sql`(SELECT destination_label FROM branch_report_ticket_sales
                      WHERE route_id = ${query.routeId}::uuid AND branch_id = ${branchId}::uuid
                      ORDER BY sold_at DESC LIMIT 1)`
        : Prisma.sql`NULL::text`
    } AS destination_label,
    ${
      query.busId
        ? Prisma.sql`(SELECT plate FROM branch_report_buses
                      WHERE id = ${query.busId}::uuid AND branch_id = ${branchId}::uuid)`
        : Prisma.sql`NULL::text`
    } AS bus_plate`;
