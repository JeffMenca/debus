import { z } from 'zod';
import { isLaterInstant, isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { type USER_ROLES } from './auth';
import { distanceKmSchema, mileageKmSchema } from './fleet';
import { pageQuerySchema, pageSchema } from './pagination';
import { moneySchema } from './settings';

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
  // The real departure recorded when the bus left; null while it has not.
  departedAt: z.iso.datetime().nullable(),
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

// A rental pays the driver 15% more than the base salary per trip.
export const RENTAL_DRIVER_BONUS = 0.15;
export const RECORDED_BY_ROLES = [
  'BRANCH_ADMIN',
  'DRIVER',
] as const satisfies (typeof USER_ROLES)[number][];

// The longest distance one trip can record: a round trip over the longest route or rental the
// API accepts (2000 km each way) with room to spare. A bigger figure is a typing mistake.
export const MAX_TRIP_DISTANCE_KM = 5_000;

// A bus may leave a little ahead of its schedule, but not days ahead of it.
export const EARLY_DEPARTURE_TOLERANCE_MS = 12 * 3_600_000;

export const recordDepartureRequestSchema = z.object({
  departedAt: z.iso.datetime(),
  startMileageKm: mileageKmSchema,
});
export type RecordDepartureRequest = z.infer<typeof recordDepartureRequestSchema>;

export const recordArrivalRequestSchema = z.object({
  arrivedAt: z.iso.datetime(),
  endMileageKm: mileageKmSchema,
  fuelCost: moneySchema,
});
export type RecordArrivalRequest = z.infer<typeof recordArrivalRequestSchema>;

const tripDepartureSchema = recordDepartureRequestSchema.extend({
  recordedByRole: z.enum(RECORDED_BY_ROLES),
});
const tripArrivalSchema = recordArrivalRequestSchema.extend({
  distanceKm: z.number().int().nonnegative(),
  depreciationPerKm: z.number().nonnegative(),
  depreciationAmount: z.number().nonnegative(),
  driverPay: z.number().nonnegative(),
  recordedByRole: z.enum(RECORDED_BY_ROLES),
});

// What the trip screen needs: the trip, both records, warnings and the values it suggests.
export const tripDetailSchema = tripSchema.extend({
  distanceKm: z.number().nullable(),
  busActive: z.boolean(),
  driverActive: z.boolean(),
  suggestedStartMileageKm: z.number().int().nonnegative(),
  depreciationPerKmToday: z.number().nonnegative().nullable(),
  expectedDriverPay: z.number().nonnegative(),
  canDelete: z.boolean(),
  departure: tripDepartureSchema.nullable(),
  arrival: tripArrivalSchema.nullable(),
});
export type TripDetail = z.infer<typeof tripDetailSchema>;

// A paid rental waits for its bus (PENDING), has its trip (ASSIGNED) or was cancelled by the branch.
export const RENTAL_REQUEST_STATUSES = ['PENDING', 'ASSIGNED', 'CANCELLED'] as const;
export type RentalRequestStatus = (typeof RENTAL_REQUEST_STATUSES)[number];

export const rentalToAssignSchema = z.object({
  id: z.uuid(),
  branchId: z.uuid(),
  clientName: z.string(),
  nit: z.string(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  departureAt: z.iso.datetime(),
  returnAt: z.iso.datetime().nullable(),
  passengers: z.number().int().positive(),
  distanceKm: distanceKmSchema,
  price: z.number().nonnegative(),
  status: z.enum(RENTAL_REQUEST_STATUSES),
  tripId: z.uuid().nullable(),
});
export type RentalToAssign = z.infer<typeof rentalToAssignSchema>;

export const rentalRequestListQuerySchema = z
  .object({
    status: z.enum(['all', ...RENTAL_REQUEST_STATUSES]).default('PENDING'),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape);
export type RentalRequestListQuery = z.infer<typeof rentalRequestListQuerySchema>;
export const rentalRequestPageSchema = pageSchema(rentalToAssignSchema);
export type RentalRequestPage = z.infer<typeof rentalRequestPageSchema>;

export const assignRentalRequestSchema = z.object({
  busId: z.uuid(),
  driverId: z.uuid(),
  estimatedArrivalAt: z.iso.datetime(),
});
export type AssignRentalRequest = z.infer<typeof assignRentalRequestSchema>;
