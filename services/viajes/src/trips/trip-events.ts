import type {
  TripCompletedPayload,
  TripDeletedPayload,
  TripDepartedPayload,
} from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

type TripRow = Prisma.TripGetPayload<object>;
type DepartureRow = Prisma.TripDepartureGetPayload<object>;
type ArrivalRow = Prisma.TripArrivalGetPayload<object>;

export const toTripDepartedPayload = (
  trip: TripRow,
  departure: DepartureRow,
): TripDepartedPayload => ({
  tripId: trip.id,
  branchId: trip.branchId,
  busId: trip.busId,
  driverId: trip.driverId,
  departedAt: departure.departedAt.toISOString(),
  startMileageKm: departure.startMileageKm,
});

export const toTripCompletedPayload = (
  trip: TripRow,
  departure: DepartureRow,
  arrival: ArrivalRow,
): TripCompletedPayload => ({
  tripId: trip.id,
  type: trip.type,
  branchId: trip.branchId,
  routeId: trip.routeId,
  busId: trip.busId,
  driverId: trip.driverId,
  departedAt: departure.departedAt.toISOString(),
  arrivedAt: arrival.arrivedAt.toISOString(),
  startMileageKm: departure.startMileageKm,
  endMileageKm: arrival.endMileageKm,
  fuelCost: arrival.fuelCost.toNumber(),
  depreciationPerKm: arrival.depreciationPerKm.toNumber(),
  depreciationAmount: arrival.depreciationAmount.toNumber(),
  driverPay: arrival.driverPay.toNumber(),
});

export const toTripDeletedPayload = (trip: TripRow): TripDeletedPayload => ({
  tripId: trip.id,
  type: trip.type,
  branchId: trip.branchId,
  busId: trip.busId,
  driverId: trip.driverId,
  departureAt: trip.departureAt.toISOString(),
});
