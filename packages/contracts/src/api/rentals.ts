import { z } from 'zod';
import { isLaterInstant, isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { pagedDayRangeQuery } from './day-range';
import { guatemalaDepartmentSchema } from './branches';
import { distanceKmSchema } from './fleet';
import { pageSchema } from './pagination';
import { moneySchema } from './settings';
import { SALE_CHANNELS } from './tickets';

export const RENTAL_STATUSES = ['REQUESTED', 'CONFIRMED', 'PAID', 'CANCELLED'] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

const label = z.string().trim().min(1).max(120);
type Trip = { departureAt: string; returnAt: string | null };
const returnAfterDeparture = <T extends z.ZodType<Trip>>(schema: T) =>
  schema.refine((value) => !value.returnAt || isLaterInstant(value.returnAt, value.departureAt), {
    path: ['returnAt'],
    message: 'return must be after departure',
  });

// Field names match the RentalPaid event that clientes publishes once the rental is paid.
const rentalTripSchema = z.object({
  branchId: z.uuid(),
  originLabel: label,
  destinationLabel: label,
  departureAt: z.iso.datetime(),
  returnAt: z.iso.datetime().nullable(),
  passengers: z.number().int().positive().max(200),
  distanceKm: distanceKmSchema,
});

export const rentalRequestSchema = returnAfterDeparture(rentalTripSchema);
export type RentalRequest = z.infer<typeof rentalRequestSchema>;

// A counter rental is recorded already confirmed for an existing client, who pays it from their
// wallet: the branch admin sets its price on the spot and the rest comes from the client's profile.
export const counterRentalRequestSchema = returnAfterDeparture(
  rentalTripSchema.extend({
    originLabel: guatemalaDepartmentSchema,
    destinationLabel: guatemalaDepartmentSchema,
    clientId: z.uuid(),
    price: moneySchema,
  }),
);
export type CounterRentalRequest = z.infer<typeof counterRentalRequestSchema>;

// The branch admin keeps the estimate or sets another price, and may correct the distance.
export const confirmRentalRequestSchema = z.object({
  price: moneySchema,
  distanceKm: distanceKmSchema.optional(),
});
export type ConfirmRentalRequest = z.infer<typeof confirmRentalRequestSchema>;

// Sent with Idempotency-Key = the rental id. A rental with a client is debited from their wallet; an
// old counter rental without one records the cash the branch received.
export const payRentalRequestSchema = z.object({ paidOn: isoDateSchema });
export type PayRentalRequest = z.infer<typeof payRentalRequestSchema>;

// The distance has at most one decimal and the rate two, so whole tenths of a km times cents is
// exact; only the final rounding to the cent remains. The API and the screens price with it.
export function estimateRentalPrice(distanceKm: number, ratePerKm: number): number {
  const tenthsTimesCents = Math.round(distanceKm * 10) * Math.round(ratePerKm * 100);
  return Math.round(tenthsTimesCents / 10) / 100;
}

export const rentalEstimateQuerySchema = z.object({
  distanceKm: z.coerce.number().pipe(distanceKmSchema),
});
export type RentalEstimateQuery = z.infer<typeof rentalEstimateQuerySchema>;

// The rental rate in force today and what the trip would cost with it.
export const rentalEstimateSchema = z.object({
  ratePerKm: z.number().positive(),
  estimatedPrice: z.number().positive(),
  effectiveFrom: isoDateSchema,
});
export type RentalEstimate = z.infer<typeof rentalEstimateSchema>;

export const rentalSchema = rentalTripSchema.extend({
  id: z.uuid(),
  status: z.enum(RENTAL_STATUSES),
  channel: z.enum(SALE_CHANNELS),
  clientId: z.uuid().nullable(),
  nit: z.string(),
  clientName: z.string(),
  email: z.string().nullable(),
  ratePerKm: z.number().positive(),
  estimatedPrice: z.number().positive(),
  price: z.number().positive().nullable(),
  requestedAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  paidOn: isoDateSchema.nullable(),
  paidAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type Rental = z.infer<typeof rentalSchema>;

export const rentalListQuerySchema = pagedDayRangeQuery({
  status: z.enum(['all', ...RENTAL_STATUSES]).default('all'),
  q: searchTermSchema.optional(),
});
export type RentalListQuery = z.infer<typeof rentalListQuerySchema>;
export const rentalPageSchema = pageSchema(rentalSchema);
export type RentalPage = z.infer<typeof rentalPageSchema>;
