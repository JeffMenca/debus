import { type SystemBusOptionsQuery, escapeLikePattern, pageArgs } from '@debus/contracts';
import { Prisma } from '../../generated/prisma/client';
import { NO_BRANCH_NAME, isBranch } from '../system-finance/branch-entries.sql';

// Every bus of every branch, inactive ones too: their repairs are part of the history.
const matchingBuses = (query: SystemBusOptionsQuery) => Prisma.sql`
  FROM branch_report_buses b
  LEFT JOIN branches br ON br.id = b.branch_id
  WHERE TRUE ${isBranch('b.branch_id', query.branchId)}
  ${query.q ? Prisma.sql`AND b.search_text LIKE ${`%${escapeLikePattern(query.q)}%`}` : Prisma.empty}`;

export const busOptionsPageQuery = (query: SystemBusOptionsQuery) => {
  const { skip, take } = pageArgs(query);
  return Prisma.sql`
    SELECT b.id, b.plate, b.brand, b.model, COALESCE(br.name, ${NO_BRANCH_NAME}::text) AS branch_name
    ${matchingBuses(query)}
    ORDER BY b.plate, b.id LIMIT ${take} OFFSET ${skip}`;
};

export const busOptionsTotalsQuery = (query: SystemBusOptionsQuery) =>
  Prisma.sql`SELECT COUNT(*)::int AS buses ${matchingBuses(query)}`;
