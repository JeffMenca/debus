import type { Trip, TripScheduledPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

type TripRow = Prisma.TripGetPayload<object>;
// Lists select only the departure instant; the detail brings the whole record.
type TripWithDeparture = TripRow & { departure?: { departedAt: Date } | null };

export const TRIP_LIST_INCLUDE = { departure: { select: { departedAt: true } } } as const;

export const toTrip = (row: TripWithDeparture): Trip => ({
  id: row.id,
  type: row.type,
  status: row.status,
  branchId: row.branchId,
  routeId: row.routeId,
  originName: row.originLabel,
  destinationName: row.destinationLabel,
  busId: row.busId,
  busPlate: row.busPlate,
  driverId: row.driverId,
  driverName: row.driverName,
  departureAt: row.departureAt.toISOString(),
  estimatedArrivalAt: row.estimatedArrivalAt.toISOString(),
  ticketPrice: row.ticketPrice?.toNumber() ?? null,
  capacity: row.capacity,
  departedAt: row.departure?.departedAt.toISOString() ?? null,
});

export const toTripScheduledPayload = (row: TripRow): TripScheduledPayload => ({
  tripId: row.id,
  type: row.type,
  branchId: row.branchId,
  routeId: row.routeId,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  busId: row.busId,
  busPlate: row.busPlate,
  capacity: row.capacity,
  driverId: row.driverId,
  ticketPrice: row.ticketPrice?.toNumber() ?? null,
  departureAt: row.departureAt.toISOString(),
  estimatedArrivalAt: row.estimatedArrivalAt.toISOString(),
  rentalId: row.rentalId,
});
