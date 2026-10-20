import type { Ticket, TicketSoldPayload } from '@debus/contracts';
import type { Prisma } from '../generated/prisma/client';

// Everything a sold ticket answers with and announces.
export const SOLD_TICKET_INCLUDE = {
  trip: true,
  seats: { select: { seatNumber: true }, orderBy: { seatNumber: 'asc' } },
} satisfies Prisma.TicketInclude;
export type SoldTicket = Prisma.TicketGetPayload<{ include: typeof SOLD_TICKET_INCLUDE }>;

export const seatNumbers = (ticket: SoldTicket): number[] =>
  ticket.seats.map((seat) => seat.seatNumber);

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
