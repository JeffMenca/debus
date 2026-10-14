import { z } from 'zod';
import { isoDateSchema } from '../dates';
import { moneySchema } from '../api/settings';
import { SALE_CHANNELS, seatSelectionSchema } from '../api/tickets';

const cents = (amount: number): number => Math.round(amount * 100);
const label = z.string().min(1);
const nit = z.string().min(1).max(20);

// branchId is the origin branch of the trip: the income belongs to it.
export const ticketSoldPayloadSchema = z
  .object({
    ticketId: z.uuid(),
    tripId: z.uuid(),
    routeId: z.uuid(),
    branchId: z.uuid(),
    busId: z.uuid(),
    originLabel: label,
    destinationLabel: label,
    departureAt: z.iso.datetime(),
    channel: z.enum(SALE_CHANNELS),
    clientId: z.uuid().nullable(),
    nit,
    buyerName: z.string().min(1).max(120),
    email: z.email().nullable(),
    seats: seatSelectionSchema,
    unitPrice: moneySchema,
    total: moneySchema,
    paidOn: isoDateSchema,
    soldAt: z.iso.datetime(),
  })
  .refine((value) => cents(value.total) === cents(value.unitPrice) * value.seats.length, {
    path: ['total'],
    message: 'total must be the unit price times the seats',
  })
  .refine((value) => value.channel === 'COUNTER' || (value.clientId && value.email), {
    path: ['clientId'],
    message: 'an online purchase needs the client and the email',
  });
export type TicketSoldPayload = z.infer<typeof ticketSoldPayloadSchema>;

export const REFUND_REASONS = ['TRIP_DELETED'] as const;

// Only tickets paid with the wallet are refunded here; cash sales are returned at the counter.
export const refundRequestedPayloadSchema = z.object({
  ticketId: z.uuid(),
  tripId: z.uuid(),
  clientId: z.uuid(),
  nit,
  seats: seatSelectionSchema,
  amount: moneySchema,
  reason: z.enum(REFUND_REASONS),
  originLabel: label,
  destinationLabel: label,
  departureAt: z.iso.datetime(),
  requestedAt: z.iso.datetime(),
});
export type RefundRequestedPayload = z.infer<typeof refundRequestedPayloadSchema>;
