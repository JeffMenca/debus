import { type SoldTicket, seatNumbers } from '../tickets/ticket-rules';

export const GENERIC_BUYER = 'Consumidor final';

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
