import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { searchTermSchema } from '../text';
import { pagedDayRangeQuery } from './day-range';
import { emailSchema, fullNameSchema, nitSchema, normalizeNit } from './auth';
import { pageSchema, pageWithSummarySchema } from './pagination';

// Where a ticket or a rental was sold: online with the wallet, or at a branch counter.
export const SALE_CHANNELS = ['ONLINE', 'COUNTER'] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];
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
// The most seats one sale carries, and so the most passengers a search asks room for.
export const SEAT_SELECTION_MAX = 10;
export const seatSelectionSchema = z
  .array(seatNumberSchema)
  .min(1)
  .max(SEAT_SELECTION_MAX)
  .refine((seats) => new Set(seats).size === seats.length, { message: 'repeated seat' });

// Day range and accent-free search, shared by the trips on sale and the ticket history.
const datedSearchQuerySchema = pagedDayRangeQuery({ q: searchTermSchema.optional() });

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

// A place is the label of a trip, exactly as GET /trips/places lists it.
const placeSchema = z.string().trim().min(1).max(120);

// seats asks for trips with at least that many free seats.
export const availableTripListQuerySchema = pagedDayRangeQuery({
  q: searchTermSchema.optional(),
  origin: placeSchema.optional(),
  destination: placeSchema.optional(),
  seats: z.coerce.number().int().min(1).max(SEAT_SELECTION_MAX).optional(),
});
export type AvailableTripListQuery = z.infer<typeof availableTripListQuerySchema>;
export const availableTripPageSchema = pageSchema(availableTripSchema);
export type AvailableTripPage = z.infer<typeof availableTripPageSchema>;

// Where the trips on sale leave from and go to. One label per branch, so it is never paginated.
export const tripPlacesSchema = z.object({
  origins: z.array(z.string()),
  destinations: z.array(z.string()),
});
export type TripPlaces = z.infer<typeof tripPlacesSchema>;

// Bounded by the bus capacity, so it is never paginated.
// It carries the trip too, so the screen that sells its seats needs nothing else.
export const seatMapSchema = z.object({
  tripId: z.uuid(),
  originLabel: z.string(),
  destinationLabel: z.string(),
  busPlate: z.string(),
  capacity: z.number().int().positive(),
  ticketPrice: z.number().positive(),
  departureAt: z.iso.datetime(),
  estimatedArrivalAt: z.iso.datetime(),
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
  channel: z.enum(SALE_CHANNELS),
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

// A purchase is the record of paying a ticket with the wallet; unlike the ticket, it survives a failure.
export const PURCHASE_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export const PURCHASE_FAILURES = [
  'INSUFFICIENT_BALANCE',
  'PAYMENT_EXPIRED',
  'WALLET_NOT_READY',
  'WALLET_UNAVAILABLE',
  'PAYMENT_REJECTED',
  'TRIP_CANCELLED',
] as const;
export type PurchaseFailure = (typeof PURCHASE_FAILURES)[number];

// The ticket exists only once the purchase is confirmed; pending and failed ones explain themselves in message.
export const purchaseSchema = z
  .object({
    ticketId: z.uuid(),
    tripId: z.uuid(),
    status: z.enum(PURCHASE_STATUSES),
    seats: z.array(seatNumberSchema),
    amount: z.number().positive(),
    paidOn: isoDateSchema,
    failure: z.enum(PURCHASE_FAILURES).nullable(),
    message: z.string().nullable(),
    ticket: ticketSchema.nullable(),
  })
  .refine(
    ({ status, failure, message, ticket }) =>
      status === 'CONFIRMED'
        ? ticket !== null && failure === null
        : ticket === null && message !== null && (status === 'FAILED') === (failure !== null),
    { message: 'the ticket, the failure and the message must match the status' },
  );
export type Purchase = z.infer<typeof purchaseSchema>;

export const ticketListQuerySchema = datedSearchQuerySchema;
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
// next is the ticket of the client that leaves soonest, whatever page is shown.
export const ticketHistorySummarySchema = z.object({ next: ticketSchema.nullable() });
export type TicketHistorySummary = z.infer<typeof ticketHistorySummarySchema>;
export const ticketPageSchema = pageWithSummarySchema(ticketSchema, ticketHistorySummarySchema);
export type TicketPage = z.infer<typeof ticketPageSchema>;
