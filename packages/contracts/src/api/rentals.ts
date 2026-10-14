import { z } from 'zod';
import { isLaterInstant, isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { fullNameSchema } from './auth';
import { pagedDayRangeQuery } from './day-range';
import { distanceKmSchema } from './fleet';
import { pageSchema } from './pagination';
import { moneySchema } from './settings';
import { SALE_CHANNELS, saleNitSchema } from './tickets';

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

export const counterRentalRequestSchema = returnAfterDeparture(
  rentalTripSchema.extend({ nit: saleNitSchema, clientName: fullNameSchema }),
);
export type CounterRentalRequest = z.infer<typeof counterRentalRequestSchema>;

// The branch admin keeps the estimate or sets another price.
export const confirmRentalRequestSchema = z.object({ price: moneySchema });
export type ConfirmRentalRequest = z.infer<typeof confirmRentalRequestSchema>;

// Paid from the wallet with an Idempotency-Key header.
export const payRentalRequestSchema = z.object({ paidOn: isoDateSchema });
export type PayRentalRequest = z.infer<typeof payRentalRequestSchema>;

export const rentalSchema = rentalTripSchema.extend({
  id: z.uuid(),
  status: z.enum(RENTAL_STATUSES),
  channel: z.enum(SALE_CHANNELS),
  clientId: z.uuid().nullable(),
  nit: z.string(),
  clientName: z.string(),
  estimatedPrice: z.number().positive(),
  price: z.number().positive().nullable(),
  requestedAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  paidOn: isoDateSchema.nullable(),
});
export type Rental = z.infer<typeof rentalSchema>;

export const rentalListQuerySchema = pagedDayRangeQuery({
  status: z.enum(['all', ...RENTAL_STATUSES]).default('all'),
  q: searchTermSchema.optional(),
});
export type RentalListQuery = z.infer<typeof rentalListQuerySchema>;
export const rentalPageSchema = pageSchema(rentalSchema);
export type RentalPage = z.infer<typeof rentalPageSchema>;
