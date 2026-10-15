import { type BranchBusesQuery, escapeLikePattern, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';

// The status a person sees: inactive wins, then on the road, then the operational status (as in flota).
// It lives only here because the status filter and the tab counts need it in the database.
const busStatusSql = Prisma.sql`
  CASE WHEN NOT b.active THEN 'INACTIVE'
       WHEN COALESCE(t.in_transit, false) THEN 'IN_TRANSIT'
       ELSE b.operational_status END`;

// Buses of the branch with their trip facts; the status filter is applied on top of this set.
const busesOfBranch = (branchId: string, q?: string) => Prisma.sql`
  WITH trip_stats AS (
    SELECT bus_id,
           (COUNT(*) FILTER (WHERE arrived_at IS NOT NULL))::int AS completed_trips,
           MAX(end_mileage_km) AS last_mileage_km,
           bool_or(departed_at IS NOT NULL AND arrived_at IS NULL AND deleted_at IS NULL) AS in_transit
    FROM branch_report_trips WHERE branch_id = ${branchId}::uuid GROUP BY bus_id
  )
  SELECT b.id, b.plate, b.brand, b.model, b.capacity, b.mileage_km,
         d.full_name AS driver_name, COALESCE(t.completed_trips, 0)::int AS completed_trips,
         t.last_mileage_km, ${busStatusSql} AS status
  FROM branch_report_buses b
  LEFT JOIN trip_stats t ON t.bus_id = b.id
  LEFT JOIN branch_report_drivers d ON d.id = b.assigned_driver_id
  WHERE b.branch_id = ${branchId}::uuid
  ${q ? Prisma.sql`AND b.search_text LIKE ${`%${escapeLikePattern(q)}%`}` : Prisma.empty}`;

const withStatus = (status: BranchBusesQuery['status']) =>
  status === 'all' ? Prisma.empty : Prisma.sql`WHERE status = ${status}`;

const fromFilteredBuses = (branchId: string, query: BranchBusesQuery) => Prisma.sql`
  FROM (${busesOfBranch(branchId, query.q)}) buses ${withStatus(query.status)}`;

const ordered = Prisma.sql`ORDER BY plate, id`;

export const busPageQuery = (branchId: string, query: BranchBusesQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT * ${fromFilteredBuses(branchId, query)} ${ordered} LIMIT ${take} OFFSET ${skip}`;
};

export const allBusesQuery = (branchId: string, query: BranchBusesQuery) => Prisma.sql`
  SELECT * ${fromFilteredBuses(branchId, query)} ${ordered}`;

export const busTotalsQuery = (branchId: string, query: BranchBusesQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS buses, COALESCE(SUM(completed_trips), 0)::int AS completed_trips
  ${fromFilteredBuses(branchId, query)}`;

// The tabs count every status, so the status filter does not apply here.
export const statusCountsQuery = (branchId: string, q?: string) => Prisma.sql`
  SELECT status, COUNT(*)::int AS buses FROM (${busesOfBranch(branchId, q)}) buses GROUP BY status`;
