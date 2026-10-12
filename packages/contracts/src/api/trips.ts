import { z } from 'zod';
import { isLaterInstant, isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { pageQuerySchema, pageSchema } from './pagination';

export const TRIP_TYPES = ['REGULAR', 'RENTAL'] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const TRIP_STATUSES = ['SCHEDULED', 'IN_TRANSIT', 'COMPLETED'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export const SALE_CLOSED_REASONS = ['NOT_FOUND', 'NOT_REGULAR', 'DEPARTED'] as const;

const tripWindow = z.object({
  departureAt: z.iso.datetime(),
  estimatedArrivalAt: z.iso.datetime(),
});
const arrivalAfterDeparture = (value: z.infer<typeof tripWindow>) =>
  isLaterInstant(value.estimatedArrivalAt, value.departureAt);

export const scheduleTripRequestSchema = tripWindow
  .extend({ routeId: z.uuid(), busId: z.uuid(), driverId: z.uuid() })
  .refine(arrivalAfterDeparture, {
    path: ['estimatedArrivalAt'],
    message: 'arrival must be after departure',
  });
export type ScheduleTripRequest = z.infer<typeof scheduleTripRequestSchema>;

export const tripSchema = z.object({
  id: z.uuid(),
  type: z.enum(TRIP_TYPES),
  status: z.enum(TRIP_STATUSES),
  branchId: z.uuid(),
  routeId: z.uuid().nullable(),
  originName: z.string(),
  destinationName: z.string(),
  busId: z.uuid(),
  busPlate: z.string(),
  driverId: z.uuid(),
  driverName: z.string(),
  departureAt: z.iso.datetime(),
  estimatedArrivalAt: z.iso.datetime(),
  ticketPrice: z.number().nullable(),
  capacity: z.number().int().positive(),
});
export type Trip = z.infer<typeof tripSchema>;

export const tripListQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    status: z.enum(['all', ...TRIP_STATUSES]).default('all'),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape)
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'to must not be before from',
  });
export type TripListQuery = z.infer<typeof tripListQuerySchema>;
export const tripPageSchema = pageSchema(tripSchema);
export type TripPage = z.infer<typeof tripPageSchema>;

export const saleStatusSchema = z.object({
  tripId: z.uuid(),
  open: z.boolean(),
  reason: z.enum(SALE_CLOSED_REASONS).optional(),
  ticketPrice: z.number().nullable().optional(),
  capacity: z.number().int().positive().optional(),
  departureAt: z.iso.datetime().optional(),
});
export type SaleStatus = z.infer<typeof saleStatusSchema>;
