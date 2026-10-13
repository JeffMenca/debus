import { z } from 'zod';
import { BUS_MIN_YEAR, busFieldsSchema, distanceKmSchema, driverFieldsSchema } from '../api/fleet';
import { moneySchema } from '../api/settings';

const version = z.number().int().positive();

// BusAdded, BusUpdated and BusDeactivated carry the whole snapshot; consumers keep the highest version.
// The producer already checked how far ahead the year is, so a consumer never rejects it for that.
export const busChangedPayloadSchema = busFieldsSchema.extend({
  busId: z.uuid(),
  branchId: z.uuid(),
  year: z.number().int().min(BUS_MIN_YEAR),
  active: z.boolean(),
  version,
});
export type BusChangedPayload = z.infer<typeof busChangedPayloadSchema>;

// DriverAdded and DriverUpdated; the email lets notificaciones warn about the licence and
// administracion open the driver's account with the same id.
export const driverChangedPayloadSchema = driverFieldsSchema.extend({
  driverId: z.uuid(),
  branchId: z.uuid(),
  active: z.boolean(),
  version,
});
export type DriverChangedPayload = z.infer<typeof driverChangedPayloadSchema>;

export const routeChangedPayloadSchema = z.object({
  routeId: z.uuid(),
  originBranchId: z.uuid(),
  destinationBranchId: z.uuid(),
  distanceKm: distanceKmSchema,
  ticketPrice: moneySchema,
  active: z.boolean(),
  version,
});
export type RouteChangedPayload = z.infer<typeof routeChangedPayloadSchema>;

export const routeDeletedPayloadSchema = z.object({ routeId: z.uuid() });
export type RouteDeletedPayload = z.infer<typeof routeDeletedPayloadSchema>;
