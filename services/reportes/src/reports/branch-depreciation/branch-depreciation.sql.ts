import {
  type BranchDepreciationQuery,
  escapeLikePattern,
  guatemalaDayRange,
  pageArgs,
} from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';

// Every bus of the branch (inactive ones too: they have history) with what its trips depreciated.
// Arrivals are filtered by the Guatemalan day, the same day the depreciation was fixed on.
const depreciationOfBranch = (branchId: string, query: BranchDepreciationQuery) => {
  const days = guatemalaDayRange(query.from, query.to);
  return Prisma.sql`
    WITH done AS (
      SELECT bus_id, COUNT(*)::int AS trips, SUM(end_mileage_km - start_mileage_km)::int AS km,
             SUM(depreciation_amount)::float8 AS accumulated
      FROM branch_report_trips
      WHERE branch_id = ${branchId}::uuid AND arrived_at IS NOT NULL AND deleted_at IS NULL
      ${days.gte ? Prisma.sql`AND arrived_at >= ${days.gte}` : Prisma.empty}
      ${days.lt ? Prisma.sql`AND arrived_at < ${days.lt}` : Prisma.empty}
      GROUP BY bus_id
    )
    SELECT b.id, b.plate, b.brand, b.model,
           COALESCE(d.trips, 0) AS trips, COALESCE(d.km, 0) AS km,
           COALESCE(d.accumulated, 0)::float8 AS accumulated
    FROM branch_report_buses b LEFT JOIN done d ON d.bus_id = b.id
    WHERE b.branch_id = ${branchId}::uuid
    ${
      query.q
        ? Prisma.sql`AND b.search_text LIKE ${`%${escapeLikePattern(query.q)}%`}`
        : Prisma.empty
    }`;
};

const fromFilteredBuses = (branchId: string, query: BranchDepreciationQuery) =>
  Prisma.sql`FROM (${depreciationOfBranch(branchId, query)}) buses`;

const ordered = Prisma.sql`ORDER BY plate, id`;

export const depreciationPageQuery = (branchId: string, query: BranchDepreciationQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT * ${fromFilteredBuses(branchId, query)} ${ordered} LIMIT ${take} OFFSET ${skip}`;
};

export const allDepreciationQuery = (
  branchId: string,
  query: BranchDepreciationQuery,
) => Prisma.sql`
  SELECT * ${fromFilteredBuses(branchId, query)} ${ordered}`;

export const depreciationTotalsQuery = (
  branchId: string,
  query: BranchDepreciationQuery,
) => Prisma.sql`
  SELECT COUNT(*)::int AS buses, COALESCE(SUM(km), 0)::int AS km,
         COALESCE(SUM(accumulated), 0)::float8 AS accumulated
  ${fromFilteredBuses(branchId, query)}`;

// The newest version that already applies: by its effective day, then by when it was saved.
export const currentRateQuery = (today: string) => Prisma.sql`
  SELECT depreciation_per_km::float8 AS depreciation_per_km
  FROM branch_report_depreciation_rates
  WHERE effective_from <= ${today}::date
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1`;
