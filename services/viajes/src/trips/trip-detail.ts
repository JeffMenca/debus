import type { TripDetail } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';
import { deletionProblem, driverPayFor } from './trip-cycle-rules';
import { toTrip } from './trip-mappers';

export const TRIP_DETAIL_INCLUDE = { departure: true, arrival: true } as const;
export type TripWithRecords = Prisma.TripGetPayload<{ include: typeof TRIP_DETAIL_INCLUDE }>;

export interface TripDetailContext {
  bus: { active: boolean; mileageKm: number } | null;
  driver: { active: boolean; baseSalary: number } | null;
  distanceKm: number | null;
  depreciationPerKmToday: number | null;
}

export function toTripDetail(row: TripWithRecords, context: TripDetailContext): TripDetail {
  const { departure, arrival } = row;
  return {
    ...toTrip(row),
    distanceKm: context.distanceKm,
    busActive: context.bus?.active ?? false,
    driverActive: context.driver?.active ?? false,
    suggestedStartMileageKm: context.bus?.mileageKm ?? 0,
    depreciationPerKmToday: context.depreciationPerKmToday,
    expectedDriverPay: driverPayFor(row.type, context.driver?.baseSalary ?? 0),
    canDelete: deletionProblem(row.status) === null,
    departure: departure && {
      departedAt: departure.departedAt.toISOString(),
      startMileageKm: departure.startMileageKm,
      recordedByRole: departure.recordedByRole,
    },
    arrival: arrival && {
      arrivedAt: arrival.arrivedAt.toISOString(),
      endMileageKm: arrival.endMileageKm,
      fuelCost: arrival.fuelCost.toNumber(),
      distanceKm: arrival.distanceKm,
      depreciationPerKm: arrival.depreciationPerKm.toNumber(),
      depreciationAmount: arrival.depreciationAmount.toNumber(),
      driverPay: arrival.driverPay.toNumber(),
      recordedByRole: arrival.recordedByRole,
    },
  };
}
