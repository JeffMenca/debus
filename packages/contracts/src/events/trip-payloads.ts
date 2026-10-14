import { z } from 'zod';
import { mileageKmSchema } from '../api/fleet';
import { moneySchema } from '../api/settings';
import { TRIP_TYPES } from '../api/trips';
import { EVENT_AMOUNT_MAX } from './limits';

const money = z.number().nonnegative().max(EVENT_AMOUNT_MAX);

export const tripScheduledPayloadSchema = z.object({
  tripId: z.uuid(),
  type: z.enum(TRIP_TYPES),
  branchId: z.uuid(),
  routeId: z.uuid().nullable(),
  originLabel: z.string().min(1),
  destinationLabel: z.string().min(1),
  busId: z.uuid(),
  busPlate: z.string(),
  capacity: z.number().int().positive(),
  driverId: z.uuid(),
  // Regular trips sell seats at this price; a rental has no ticket price.
  ticketPrice: moneySchema.nullable(),
  departureAt: z.iso.datetime(),
  estimatedArrivalAt: z.iso.datetime(),
  rentalId: z.uuid().nullable(),
});
export type TripScheduledPayload = z.infer<typeof tripScheduledPayloadSchema>;

export const tripDeletedPayloadSchema = z.object({
  tripId: z.uuid(),
  type: z.enum(TRIP_TYPES),
  branchId: z.uuid(),
  busId: z.uuid(),
  driverId: z.uuid(),
  departureAt: z.iso.datetime(),
});
export type TripDeletedPayload = z.infer<typeof tripDeletedPayloadSchema>;

export const tripDepartedPayloadSchema = z.object({
  tripId: z.uuid(),
  branchId: z.uuid(),
  busId: z.uuid(),
  driverId: z.uuid(),
  departedAt: z.iso.datetime(),
  startMileageKm: mileageKmSchema,
});
export type TripDepartedPayload = z.infer<typeof tripDepartedPayloadSchema>;

// Amounts are fixed when the trip completes (J3-2): later settings never change them.
export const tripCompletedPayloadSchema = z
  .object({
    tripId: z.uuid(),
    type: z.enum(TRIP_TYPES),
    branchId: z.uuid(),
    routeId: z.uuid().nullable(),
    busId: z.uuid(),
    driverId: z.uuid(),
    departedAt: z.iso.datetime(),
    arrivedAt: z.iso.datetime(),
    startMileageKm: mileageKmSchema,
    endMileageKm: mileageKmSchema,
    fuelCost: money,
    depreciationPerKm: money,
    depreciationAmount: money,
    driverPay: money,
  })
  .refine((value) => value.endMileageKm >= value.startMileageKm, {
    path: ['endMileageKm'],
    message: 'final mileage cannot be lower than the starting one',
  });
export type TripCompletedPayload = z.infer<typeof tripCompletedPayloadSchema>;
