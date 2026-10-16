import { type Ticket, type TicketSoldPayload, idempotencyKeySchema } from '@debus/contracts';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { MESSAGES } from '../messages';

export const GENERIC_BUYER = 'Consumidor final';

// Everything a sold ticket answers with and announces.
export const SOLD_TICKET_INCLUDE = {
  trip: true,
  seats: { select: { seatNumber: true }, orderBy: { seatNumber: 'asc' } },
} satisfies Prisma.TicketInclude;
export type SoldTicket = Prisma.TicketGetPayload<{ include: typeof SOLD_TICKET_INCLUDE }>;

export function readIdempotencyKey(raw: string | undefined): string {
  const parsed = idempotencyKeySchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestException(MESSAGES.keyMissing);
  return parsed.data;
}

const seatNumbers = (ticket: SoldTicket): number[] => ticket.seats.map((seat) => seat.seatNumber);

const sortedSeats = (seats: number[]): string => [...seats].sort((a, b) => a - b).join(',');

// A retry sends the same key with the same sale; anything else reused the key by mistake.
export function sameSale(
  ticket: SoldTicket,
  request: { tripId: string; seats: number[] },
  branchId: string,
): boolean {
  return (
    ticket.channel === 'COUNTER' &&
    ticket.tripId === request.tripId &&
    ticket.trip.branchId === branchId &&
    sortedSeats(seatNumbers(ticket)) === sortedSeats(request.seats)
  );
}

export const buyerNameFor = (
  written: string | undefined,
  client: { fullName: string } | null,
): string => written ?? client?.fullName ?? GENERIC_BUYER;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function toTicket(ticket: SoldTicket): Ticket {
  return {
    id: ticket.id,
    status: ticket.status,
    channel: ticket.channel,
    tripId: ticket.tripId,
    originLabel: ticket.trip.originLabel,
    destinationLabel: ticket.trip.destinationLabel,
    departureAt: ticket.trip.departureAt.toISOString(),
    busPlate: ticket.trip.busPlate,
    seats: seatNumbers(ticket),
    unitPrice: ticket.unitPrice.toNumber(),
    total: ticket.total.toNumber(),
    nit: ticket.nit,
    buyerName: ticket.buyerName,
    paidOn: isoDay(ticket.paidOn),
    soldAt: ticket.createdAt.toISOString(),
  };
}

// branchId is the origin branch of the trip, which is also the branch of whoever sold it.
export function toTicketSoldPayload(ticket: SoldTicket): TicketSoldPayload {
  return {
    ticketId: ticket.id,
    tripId: ticket.tripId,
    routeId: ticket.trip.routeId,
    branchId: ticket.trip.branchId,
    busId: ticket.trip.busId,
    originLabel: ticket.trip.originLabel,
    destinationLabel: ticket.trip.destinationLabel,
    departureAt: ticket.trip.departureAt.toISOString(),
    channel: ticket.channel,
    clientId: ticket.clientId,
    nit: ticket.nit,
    buyerName: ticket.buyerName,
    email: ticket.email,
    seats: seatNumbers(ticket),
    unitPrice: ticket.unitPrice.toNumber(),
    total: ticket.total.toNumber(),
    paidOn: isoDay(ticket.paidOn),
    soldAt: ticket.createdAt.toISOString(),
  };
}
