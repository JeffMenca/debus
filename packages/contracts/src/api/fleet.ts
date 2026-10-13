import { z } from 'zod';
import { isLaterInstant, isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { emailSchema, fullNameSchema, phoneSchema } from './auth';
import { pageQuerySchema, pageWithSummarySchema } from './pagination';
import { moneySchema } from './settings';

export const BUS_OPERATIONAL_STATUSES = ['AVAILABLE', 'IN_WORKSHOP'] as const;
export type BusOperationalStatus = (typeof BUS_OPERATIONAL_STATUSES)[number];
// What a person sees: inactive wins, then a trip on the road, then the workshop.
export const BUS_DISPLAY_STATUSES = ['IN_TRANSIT', 'AVAILABLE', 'IN_WORKSHOP', 'INACTIVE'] as const;
export type BusDisplayStatus = (typeof BUS_DISPLAY_STATUSES)[number];
export const LICENSE_TYPES = ['A', 'B', 'C', 'M', 'E'] as const;
export const AVAILABILITY_REASONS = [
  'NOT_FOUND',
  'INACTIVE',
  'IN_WORKSHOP',
  'OTHER_BRANCH',
  'LICENSE_EXPIRED',
  'BUSY',
] as const;
export type AvailabilityReason = (typeof AVAILABILITY_REASONS)[number];

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const BUS_MIN_YEAR = 1980;
const strip = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase();

export const normalizePlate = (raw: string): string => strip(raw.trim());
export const plateSchema = z
  .string()
  .transform(normalizePlate)
  .pipe(z.string().regex(/^[A-Z]{1,2}\d{3}[A-Z]{3}$/));
const hasAtMostOneDecimal = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
export const distanceKmSchema = z.number().positive().max(2000).refine(hasAtMostOneDecimal, {
  message: 'at most one decimal',
});
const nameText = z.string().trim().min(1).max(40);
const listStatus = z.enum(['active', 'inactive', 'all']);

export const busFieldsSchema = z.object({
  plate: plateSchema,
  brand: nameText,
  model: nameText,
  // Checked when the value arrives, not when the module loads, so a long-running service keeps the right limit.
  year: z
    .number()
    .int()
    .min(BUS_MIN_YEAR)
    .refine((year) => year <= new Date().getFullYear() + 1, { message: 'year is too far ahead' }),
  capacity: z.number().int().min(10).max(80),
  mileageKm: z.number().int().min(0).max(5_000_000),
  operationalStatus: z.enum(BUS_OPERATIONAL_STATUSES),
  assignedDriverId: z.uuid().nullable(),
});
export type BusFields = z.infer<typeof busFieldsSchema>;

export const busSchema = busFieldsSchema.extend({
  id: z.uuid(),
  branchId: z.uuid(),
  active: z.boolean(),
  displayStatus: z.enum(BUS_DISPLAY_STATUSES),
  assignedDriverName: z.string().nullable(),
  completedTrips: z.number().int().nonnegative(),
  hasPhoto: z.boolean(),
  version: z.number().int().positive(),
});
export type Bus = z.infer<typeof busSchema>;

export const busListQuerySchema = z
  .object({
    status: z.enum(['all', ...BUS_DISPLAY_STATUSES]).default('all'),
    q: searchTermSchema.optional(),
  })
  .extend(pageQuerySchema.shape);
export type BusListQuery = z.infer<typeof busListQuerySchema>;

const count = z.number().int().nonnegative();
export const busStatusCountsSchema = z.object({
  IN_TRANSIT: count,
  AVAILABLE: count,
  IN_WORKSHOP: count,
  INACTIVE: count,
});
export type BusStatusCounts = z.infer<typeof busStatusCountsSchema>;
export const busPageSchema = pageWithSummarySchema(
  busSchema,
  z.object({ statusCounts: busStatusCountsSchema }),
);
export type BusPage = z.infer<typeof busPageSchema>;

export const licenseNumberSchema = z
  .string()
  .transform(strip)
  .pipe(z.string().regex(/^[A-Z0-9]{5,20}$/));

export const driverFieldsSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  licenseNumber: licenseNumberSchema,
  licenseType: z.enum(LICENSE_TYPES),
  licenseExpiresOn: isoDateSchema,
  baseSalary: moneySchema,
});
export type DriverFields = z.infer<typeof driverFieldsSchema>;

export const driverSchema = driverFieldsSchema.extend({
  id: z.uuid(),
  branchId: z.uuid(),
  active: z.boolean(),
  assignedBusPlate: z.string().nullable(),
  completedTrips: z.number().int().nonnegative(),
  hasPhoto: z.boolean(),
  version: z.number().int().positive(),
});
export type Driver = z.infer<typeof driverSchema>;

export const driverListQuerySchema = z
  .object({
    status: listStatus.default('active'),
    q: searchTermSchema.optional(),
    // Licences that expire within this many days, soonest first (the panel and its card).
    expiringWithinDays: z.coerce.number().int().min(1).max(60).optional(),
  })
  .extend(pageQuerySchema.shape);
export type DriverListQuery = z.infer<typeof driverListQuerySchema>;

const activeCounts = z.object({ active: count, inactive: count });
export const driverPageSchema = pageWithSummarySchema(
  driverSchema,
  z.object({ statusCounts: activeCounts }),
);
export type DriverPage = z.infer<typeof driverPageSchema>;

export const createRouteRequestSchema = z.object({
  destinationBranchId: z.uuid(),
  distanceKm: distanceKmSchema,
  ticketPrice: moneySchema,
});
export type CreateRouteRequest = z.infer<typeof createRouteRequestSchema>;

export const updateRouteRequestSchema = z.object({
  distanceKm: distanceKmSchema,
  ticketPrice: moneySchema,
  active: z.boolean(),
});
export type UpdateRouteRequest = z.infer<typeof updateRouteRequestSchema>;

export const routeSchema = z.object({
  id: z.uuid(),
  originBranchId: z.uuid(),
  originName: z.string(),
  destinationBranchId: z.uuid(),
  destinationName: z.string(),
  distanceKm: z.number(),
  ticketPrice: z.number(),
  active: z.boolean(),
  hasTrips: z.boolean(),
  version: z.number().int().positive(),
});
export type Route = z.infer<typeof routeSchema>;

export const routeListQuerySchema = z
  .object({ status: listStatus.default('active'), q: searchTermSchema.optional() })
  .extend(pageQuerySchema.shape);
export type RouteListQuery = z.infer<typeof routeListQuerySchema>;
export const routePageSchema = pageWithSummarySchema(
  routeSchema,
  z.object({ statusCounts: activeCounts }),
);
export type RoutePage = z.infer<typeof routePageSchema>;

export const availabilityQuerySchema = z
  .object({
    branchId: z.uuid(),
    busId: z.uuid(),
    driverId: z.uuid(),
    departureAt: z.iso.datetime(),
    estimatedArrivalAt: z.iso.datetime(),
    // A trip being rescheduled does not collide with itself.
    ignoreTripId: z.uuid().optional(),
  })
  .refine((value) => isLaterInstant(value.estimatedArrivalAt, value.departureAt), {
    path: ['estimatedArrivalAt'],
    message: 'arrival must be after departure',
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

const verdict = z.object({
  available: z.boolean(),
  reason: z.enum(AVAILABILITY_REASONS).optional(),
});
export const availabilitySchema = z.object({ bus: verdict, driver: verdict });
export type Availability = z.infer<typeof availabilitySchema>;
