import { type BranchRentalIncomeQuery, escapeLikePattern, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';

// A rental is attributed to the branch that confirmed it and dated by the day it was paid. Its bus is the
// one of its latest trip that was not deleted: a rental that went out again on another bus shows the new one.
// A cancelled rental gave its money back, so it is left out.
const rentalsOfBranch = (branchId: string, query: BranchRentalIncomeQuery) => Prisma.sql`
  SELECT r.id, r.client_name, r.nit, r.origin_label, r.destination_label, r.departure_at, r.return_at,
         r.paid_on, r.passengers, r.price::float8 AS price,
    (SELECT t.bus_plate FROM branch_report_trips t
     WHERE t.rental_id = r.id AND t.deleted_at IS NULL AND t.bus_plate IS NOT NULL
     ORDER BY t.departure_at DESC LIMIT 1) AS bus_plate
  FROM branch_report_rentals r
  WHERE r.branch_id = ${branchId}::uuid
    AND NOT EXISTS (SELECT 1 FROM branch_report_rental_cancellations c WHERE c.rental_id = r.id)
  ${query.from ? Prisma.sql`AND r.paid_on >= ${query.from}::date` : Prisma.empty}
  ${query.to ? Prisma.sql`AND r.paid_on <= ${query.to}::date` : Prisma.empty}
  ${
    query.q ? Prisma.sql`AND r.search_text LIKE ${`%${escapeLikePattern(query.q)}%`}` : Prisma.empty
  }`;

const latestPaymentFirst = Prisma.sql`ORDER BY paid_on DESC, departure_at DESC, id`;

export const rentalIncomePageQuery = (branchId: string, query: BranchRentalIncomeQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT * FROM (${rentalsOfBranch(branchId, query)}) rentals
    ${latestPaymentFirst} LIMIT ${take} OFFSET ${skip}`;
};

export const allRentalIncomeQuery = (branchId: string, query: BranchRentalIncomeQuery) =>
  Prisma.sql`SELECT * FROM (${rentalsOfBranch(branchId, query)}) rentals ${latestPaymentFirst}`;

export const rentalIncomeTotalsQuery = (branchId: string, query: BranchRentalIncomeQuery) =>
  Prisma.sql`
    SELECT COUNT(*)::int AS rentals, COALESCE(SUM(price), 0)::float8 AS income
    FROM (${rentalsOfBranch(branchId, query)}) rentals`;
