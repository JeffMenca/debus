import type { BranchTicketIncomePage, BranchTicketIncomeRow } from '@debus/contracts';

export type TicketIncomeTotals = BranchTicketIncomePage['summary']['totals'];
export type TicketIncomeGroup = BranchTicketIncomePage['summary']['groups'][number];

export interface TicketIncomeRecord {
  trip_id: string;
  departure_at: Date;
  route_id: string;
  origin_label: string;
  destination_label: string;
  bus_id: string;
  bus_plate: string | null;
  tickets: number;
  online_tickets: number;
  counter_tickets: number;
  income: number;
}
export interface TicketIncomeGroupRecord {
  route_id: string;
  origin_label: string;
  destination_label: string;
  tickets: number;
  income: number;
}
export type TicketIncomeTotalsRecord = TicketIncomeTotals;
export interface FilterLabelsRecord {
  origin_label: string | null;
  destination_label: string | null;
  bus_plate: string | null;
}

// The en dash exists in the standard PDF font; the web screen draws its own arrow.
export const routeName = (origin: string, destination: string): string =>
  `${origin} – ${destination}`;

export const toTicketIncomeRow = (record: TicketIncomeRecord): BranchTicketIncomeRow => ({
  tripId: record.trip_id,
  departureAt: record.departure_at.toISOString(),
  routeId: record.route_id,
  originLabel: record.origin_label,
  destinationLabel: record.destination_label,
  busId: record.bus_id,
  busPlate: record.bus_plate,
  tickets: record.tickets,
  onlineTickets: record.online_tickets,
  counterTickets: record.counter_tickets,
  income: record.income,
});

export const toTicketIncomeGroups = (records: TicketIncomeGroupRecord[]): TicketIncomeGroup[] =>
  records.map((record) => ({
    routeId: record.route_id,
    originLabel: record.origin_label,
    destinationLabel: record.destination_label,
    tickets: record.tickets,
    income: record.income,
  }));

export const toTicketIncomeTotals = (
  record: TicketIncomeTotalsRecord | undefined,
): TicketIncomeTotals => ({
  trips: record?.trips ?? 0,
  tickets: record?.tickets ?? 0,
  income: record?.income ?? 0,
});
