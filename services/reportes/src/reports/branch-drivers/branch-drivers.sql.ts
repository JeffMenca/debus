import { type BranchDriversQuery, escapeLikePattern, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';

// Drivers of the branch with the trips they finished; a trip that left and has not arrived does not count.
const driversOfBranch = (branchId: string, q?: string) => Prisma.sql`
  SELECT d.id, d.full_name, d.license_number, d.license_type, d.license_expires_on, d.active,
         COALESCE(t.done, 0)::int AS completed_trips
  FROM branch_report_drivers d
  LEFT JOIN (
    SELECT driver_id, COUNT(*) AS done FROM branch_report_trips
    WHERE branch_id = ${branchId}::uuid AND arrived_at IS NOT NULL GROUP BY driver_id
  ) t ON t.driver_id = d.id
  WHERE d.branch_id = ${branchId}::uuid
  ${q ? Prisma.sql`AND d.search_text LIKE ${`%${escapeLikePattern(q)}%`}` : Prisma.empty}`;

const withStatus = (status: BranchDriversQuery['status']) =>
  status === 'all' ? Prisma.empty : Prisma.sql`WHERE active = ${status === 'active'}`;

const fromFilteredDrivers = (branchId: string, query: BranchDriversQuery) => Prisma.sql`
  FROM (${driversOfBranch(branchId, query.q)}) drivers ${withStatus(query.status)}`;

const ordered = Prisma.sql`ORDER BY full_name, id`;

export const driverPageQuery = (branchId: string, query: BranchDriversQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT * ${fromFilteredDrivers(branchId, query)} ${ordered} LIMIT ${take} OFFSET ${skip}`;
};

export const allDriversQuery = (branchId: string, query: BranchDriversQuery) => Prisma.sql`
  SELECT * ${fromFilteredDrivers(branchId, query)} ${ordered}`;

export const driverTotalsQuery = (branchId: string, query: BranchDriversQuery) => Prisma.sql`
  SELECT COUNT(*)::int AS drivers, COALESCE(SUM(completed_trips), 0)::int AS completed_trips
  ${fromFilteredDrivers(branchId, query)}`;

// The tabs count both states, so the status filter does not apply here.
export const activeCountsQuery = (branchId: string, q?: string) => Prisma.sql`
  SELECT active, COUNT(*)::int AS drivers FROM (${driversOfBranch(branchId, q)}) drivers GROUP BY active`;
