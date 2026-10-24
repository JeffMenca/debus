import type { Rental } from '@debus/contracts';
import type { Rental as RentalRow } from '../generated/prisma/client';

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

export const toRental = (row: RentalRow): Rental => ({
  id: row.id,
  status: row.status,
  channel: row.channel,
  branchId: row.branchId,
  clientId: row.clientId,
  nit: row.nit,
  clientName: row.clientName,
  email: row.email,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  departureAt: row.departureAt.toISOString(),
  returnAt: iso(row.returnAt),
  passengers: row.passengers,
  distanceKm: row.distanceKm.toNumber(),
  ratePerKm: row.ratePerKm.toNumber(),
  estimatedPrice: row.estimatedPrice.toNumber(),
  price: row.price?.toNumber() ?? null,
  requestedAt: row.requestedAt.toISOString(),
  confirmedAt: iso(row.confirmedAt),
  paidOn: row.paidOn?.toISOString().slice(0, 10) ?? null,
  paidAt: iso(row.paidAt),
  cancelledAt: iso(row.cancelledAt),
});
