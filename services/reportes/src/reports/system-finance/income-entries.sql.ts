import { Prisma } from '../../generated/prisma/client';
import { dayRangeFilter, isBranch } from './branch-entries.sql';

export interface FinanceFilters {
  from?: string | undefined;
  to?: string | undefined;
  branchId?: string | undefined;
}

// Every ticket of the filtered range and branch, dated by the day it was paid. A deleted trip
// refunds its tickets (wallet or counter alike), so they are no longer income, even when the sale
// arrives after the deletion.
export const ticketSales = ({ from, to, branchId }: FinanceFilters) => Prisma.sql`
  SELECT s.* FROM branch_report_ticket_sales s
  WHERE NOT EXISTS (SELECT 1 FROM branch_report_trips t WHERE t.id = s.trip_id AND t.deleted_at IS NOT NULL)
  ${dayRangeFilter('s.paid_on', from, to)} ${isBranch('s.branch_id', branchId)}`;

// The tickets and the paid rentals as one entry each. A cancelled rental gave its money back, so it
// is not income, before or after it was paid. The channel of a rental is RENTAL.
export const incomeEntries = (filters: FinanceFilters) => Prisma.sql`
  SELECT s.id, s.branch_id, s.channel, s.paid_on AS day, s.origin_label, s.destination_label,
         NULL::text AS client_name, s.seats AS quantity, s.total AS amount
  FROM (${ticketSales(filters)}) s
  UNION ALL
  SELECT r.id, r.branch_id, 'RENTAL' AS channel, r.paid_on AS day, r.origin_label, r.destination_label,
         r.client_name, r.passengers AS quantity, r.price AS amount
  FROM branch_report_rentals r
  WHERE NOT EXISTS (SELECT 1 FROM branch_report_rental_cancellations c WHERE c.rental_id = r.id)
  ${dayRangeFilter('r.paid_on', filters.from, filters.to)} ${isBranch('r.branch_id', filters.branchId)}`;
