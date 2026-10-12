import type { SaleStatus } from '@debus/contracts';

interface SellableTrip {
  id: string;
  type: 'REGULAR' | 'RENTAL';
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'COMPLETED';
  departureAt: Date;
  ticketPrice: { toNumber(): number } | null;
  capacity: number;
}

// Tickets are sold for a regular trip that has not left; ventas asks this before every sale.
export function saleStatusOf(tripId: string, trip: SellableTrip | null, now: Date): SaleStatus {
  if (!trip) return { tripId, open: false, reason: 'NOT_FOUND' };
  if (trip.type !== 'REGULAR') return { tripId, open: false, reason: 'NOT_REGULAR' };
  if (trip.status !== 'SCHEDULED' || trip.departureAt <= now) {
    return { tripId, open: false, reason: 'DEPARTED' };
  }
  return {
    tripId,
    open: true,
    ticketPrice: trip.ticketPrice?.toNumber() ?? null,
    capacity: trip.capacity,
    departureAt: trip.departureAt.toISOString(),
  };
}
