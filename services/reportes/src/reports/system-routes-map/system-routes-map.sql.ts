import { Prisma } from '../../generated/prisma/client';
import { NO_BRANCH_NAME } from '../system-finance/branch-entries.sql';
import { ticketSales } from '../system-finance/income-entries.sql';

// A route is drawn while it is active and has not been deleted.
const ACTIVE_ROUTE = Prisma.sql`r.active AND r.deleted_at IS NULL`;

// Every branch that can be an end of the map: the open ones and any with active routes. The count
// is of the routes that leave from it.
export const mapBranchesQuery = Prisma.sql`
  SELECT b.id, b.name, b.latitude::float8 AS latitude, b.longitude::float8 AS longitude,
         COALESCE(c.routes, 0)::int AS routes
  FROM branches b
  LEFT JOIN (
    SELECT r.origin_branch_id, COUNT(*)::int AS routes
    FROM system_report_routes r WHERE ${ACTIVE_ROUTE}
    GROUP BY r.origin_branch_id
  ) c ON c.origin_branch_id = b.id
  WHERE b.active OR COALESCE(c.routes, 0) > 0
  ORDER BY fold_search_text(b.name), b.id`;

// The active routes of one branch with the place they go to. A destination that has no copy
// cannot be drawn, so it is left out. The tickets are every one sold on the route, whatever the
// date, except those of deleted trips.
export const mapRoutesQuery = (branchId: string) => Prisma.sql`
  SELECT r.id AS route_id, r.destination_branch_id, COALESCE(d.name, ${NO_BRANCH_NAME}::text) AS destination_name,
         d.latitude::float8 AS latitude, d.longitude::float8 AS longitude,
         r.distance_km::float8 AS distance_km, r.ticket_price::float8 AS ticket_price,
         COALESCE(t.tickets, 0)::int AS tickets
  FROM system_report_routes r
  JOIN branches d ON d.id = r.destination_branch_id
  LEFT JOIN (
    SELECT s.route_id, SUM(s.seats) AS tickets FROM (${ticketSales({})}) s
    GROUP BY s.route_id
  ) t ON t.route_id = r.id
  WHERE r.origin_branch_id = ${branchId}::uuid AND ${ACTIVE_ROUTE}
  ORDER BY fold_search_text(d.name), r.id`;
