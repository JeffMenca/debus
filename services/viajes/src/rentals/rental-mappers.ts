import type { RentalToAssign } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

type RentalRequestRow = Prisma.RentalRequestGetPayload<object>;

export const toRentalRequest = (row: RentalRequestRow): RentalToAssign => ({
  id: row.id,
  branchId: row.branchId,
  clientName: row.clientName,
  nit: row.nit,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  departureAt: row.departureAt.toISOString(),
  returnAt: row.returnAt?.toISOString() ?? null,
  passengers: row.passengers,
  distanceKm: row.distanceKm.toNumber(),
  price: row.price.toNumber(),
  status: row.status,
  tripId: row.tripId,
});
