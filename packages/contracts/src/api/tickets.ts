import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { dayRangeInOrder, dayRangeShape } from './day-range';
import { emailSchema, fullNameSchema, nitSchema, normalizeNit } from './auth';
import { pageQuerySchema, pageSchema } from './pagination';

export const TICKET_CHANNELS = ['ONLINE', 'COUNTER'] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];
// A purchase whose wallet debit fails is deleted with its seats, so no ticket stays failed.
export const TICKET_STATUSES = ['PENDING', 'CONFIRMED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// The generic counter client when the buyer gives no NIT.
export const CONSUMER_NIT = 'CF';
export const saleNitSchema = z
  .string()
  .transform(normalizeNit)
  .pipe(z.union([z.literal(CONSUMER_NIT), nitSchema]));

// Every money operation carries one; a purchase uses it as the ticket id.
export const idempotencyKeySchema = z.uuid();

// Buses hold at most 80 passengers (fleet contract); ventas checks the real capacity.
export const seatNumberSchema = z.number().int().min(1).max(80);
export const seatSelectionSchema = z
  .array(seatNumberSchema)
  .min(1)
  .max(10)
  .refine((seats) => new Set(seats).size === seats.length, { message: 'repeated seat' });

// Day range and accent-free search, shared by the trips on sale and the ticket history.
const datedSearchQuerySchema = dayRangeInOrder(
  z.object({ ...dayRangeShape, q: searchTermSchema.optional() }).extend(pageQuerySchema.shape),
);

export const availableTripSchema = z.object({
  tripId: z.uuid(),
  routeId: z.uuid(),
  branchId: z.uuid(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  departureAt: z.iso.datetime(),
  estimatedArrivalAt: z.iso.datetime(),
  ticketPrice: z.number().positive(),
  busPlate: z.string(),
  capacity: z.number().int().positive(),
  freeSeats: z.number().int().nonnegative(),
});
export type AvailableTrip = z.infer<typeof availableTripSchema>;

export const availableTripListQuerySchema = datedSearchQuerySchema;
export type AvailableTripListQuery = z.infer<typeof availableTripListQuerySchema>;
export const availableTripPageSchema = pageSchema(availableTripSchema);
export type AvailableTripPage = z.infer<typeof availableTripPageSchema>;

// Bounded by the bus capacity, so it is never paginated.
export const seatMapSchema = z.object({
  tripId: z.uuid(),
  capacity: z.number().int().positive(),
  ticketPrice: z.number().positive(),
  departureAt: z.iso.datetime(),
  taken: z.array(seatNumberSchema),
});
export type SeatMap = z.infer<typeof seatMapSchema>;

export const purchaseTicketRequestSchema = z.object({
  tripId: z.uuid(),
  seats: seatSelectionSchema,
  paidOn: isoDateSchema,
});
export type PurchaseTicketRequest = z.infer<typeof purchaseTicketRequestSchema>;

export const counterSaleRequestSchema = purchaseTicketRequestSchema.extend({
  nit: saleNitSchema.default(CONSUMER_NIT),
  buyerName: fullNameSchema.optional(),
  email: emailSchema.optional(),
});
export type CounterSaleRequest = z.infer<typeof counterSaleRequestSchema>;

export const ticketSchema = z.object({
  id: z.uuid(),
  status: z.enum(TICKET_STATUSES),
  channel: z.enum(TICKET_CHANNELS),
  tripId: z.uuid(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  departureAt: z.iso.datetime(),
  busPlate: z.string(),
  seats: z.array(seatNumberSchema),
  unitPrice: z.number().positive(),
  total: z.number().positive(),
  nit: z.string(),
  buyerName: z.string(),
  paidOn: isoDateSchema,
  soldAt: z.iso.datetime(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const ticketListQuerySchema = datedSearchQuerySchema;
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
export const ticketPageSchema = pageSchema(ticketSchema);
export type TicketPage = z.infer<typeof ticketPageSchema>;
