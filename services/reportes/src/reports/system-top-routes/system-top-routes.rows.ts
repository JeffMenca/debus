import type { SystemTopRouteRow, SystemTopRoutesPage } from '@debus/contracts';

export type TopRoutesTotals = SystemTopRoutesPage['summary']['totals'];

export interface TopRouteRecord {
  position: number;
  route_id: string;
  branch_id: string;
  origin_label: string;
  destination_label: string;
  // Null while the route has not reached the copy (or the route was deleted).
  distance_km: number | null;
  ticket_price: number | null;
  active: boolean | null;
  trips: number;
  online_tickets: number;
  counter_tickets: number;
  tickets: number;
  income: number;
}
export type TopRoutesTotalsRecord = TopRoutesTotals;

// The part of the tickets of the report that one route sold, with one decimal.
export const shareOf = (tickets: number, totalTickets: number): number =>
  totalTickets === 0 ? 0 : Math.round((tickets / totalTickets) * 1000) / 10;

export const toTopRouteRow = (record: TopRouteRecord, totalTickets: number): SystemTopRouteRow => ({
  position: record.position,
  routeId: record.route_id,
  branchId: record.branch_id,
  originLabel: record.origin_label,
  destinationLabel: record.destination_label,
  distanceKm: record.distance_km,
  ticketPrice: record.ticket_price,
  active: record.active,
  trips: record.trips,
  onlineTickets: record.online_tickets,
  counterTickets: record.counter_tickets,
  tickets: record.tickets,
  income: record.income,
  share: shareOf(record.tickets, totalTickets),
});

export const toTopRoutesTotals = (record: TopRoutesTotalsRecord | undefined): TopRoutesTotals => ({
  routes: record?.routes ?? 0,
  trips: record?.trips ?? 0,
  tickets: record?.tickets ?? 0,
  income: record?.income ?? 0,
});
