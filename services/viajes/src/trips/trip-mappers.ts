import type { Trip, TripScheduledPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

type TripRow = Prisma.TripGetPayload<object>;

export const toTrip = (row: TripRow): Trip => ({
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
