import { type SystemTopRoutesQuery, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import { ticketSales } from '../system-finance/income-entries.sql';

// One row per route with at least one ticket paid in the range, from the same sales the income
// report lists. A route sold from one origin branch; the labels are the latest ones. The income
// stays exact (numeric) until the outer query.
const routesWithTickets = (query: SystemTopRoutesQuery) => Prisma.sql`
  SELECT route_id,
         (array_agg(branch_id ORDER BY sold_at DESC, id))[1] AS branch_id,
         (array_agg(origin_label ORDER BY sold_at DESC, id))[1] AS origin_label,
         (array_agg(destination_label ORDER BY sold_at DESC, id))[1] AS destination_label,
         COUNT(DISTINCT trip_id)::int AS trips,
         COALESCE(SUM(seats) FILTER (WHERE channel = 'ONLINE'), 0)::int AS online_tickets,
         COALESCE(SUM(seats) FILTER (WHERE channel = 'COUNTER'), 0)::int AS counter_tickets,
         SUM(seats)::int AS tickets, SUM(total) AS income
  FROM (${ticketSales(query)}) s
  GROUP BY route_id`;

// The position is the rank in the whole filtered set, so a page keeps the numbers of its rows. A
// deleted route (or a tombstone that arrived before it) does not tell its distance or its price.
const rankedRoutes = (query: SystemTopRoutesQuery) => Prisma.sql`
  SELECT ROW_NUMBER() OVER (ORDER BY r.tickets DESC, r.route_id)::int AS position, r.route_id,
         r.branch_id, r.origin_label, r.destination_label, c.distance_km::float8 AS distance_km,
         c.ticket_price::float8 AS ticket_price, c.active, r.trips, r.online_tickets,
         r.counter_tickets, r.tickets, r.income::float8 AS income
  FROM (${routesWithTickets(query)}) r
  LEFT JOIN system_report_routes c ON c.id = r.route_id AND c.deleted_at IS NULL`;

const byPosition = Prisma.sql`ORDER BY position`;

export const topRoutesPageQuery = (query: SystemTopRoutesQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT * FROM (${rankedRoutes(query)}) ranked ${byPosition} LIMIT ${take} OFFSET ${skip}`;
};

export const allTopRoutesQuery = (query: SystemTopRoutesQuery) =>
  Prisma.sql`SELECT * FROM (${rankedRoutes(query)}) ranked ${byPosition}`;

export const topRoutesTotalsQuery = (query: SystemTopRoutesQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS routes, COALESCE(SUM(trips), 0)::int AS trips,
         COALESCE(SUM(tickets), 0)::int AS tickets, COALESCE(SUM(income), 0)::float8 AS income
  FROM (${routesWithTickets(query)}) r`;
