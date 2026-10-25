import { todayInGuatemala, type AvailableTrip } from '@debus/contracts';
import { SEED_BRANCHES } from '../catalog';
import { SEED_CLIENTS } from '../clients-catalog';
import { addDays } from '../dates';
import { fraction, uuidFrom } from '../ids';

// The next load may come three days after this one and removes the seed trips whose time has
// passed (refunding their tickets), so only trips further away than that are sold.
export const SALE_FROM_DAYS_AHEAD = 4;
// Share of the trips that sell in each channel, times the demand of their route.
export const SALE_RATE = 0.65;
export const ONLINE_FIRST_SEAT = 1;
export const COUNTER_FIRST_SEAT = 21;
const MAX_SEATS = 3;
const DEFAULT_DEMAND = 0.3;
const CLIENT_AT_COUNTER = 0.3;
const NAMED_AT_COUNTER = 0.65;
const WITH_EMAIL = 0.12;

// How much people ask for each route, from 0 to 1: Antigua and Quetzaltenango are the busiest
// ones, Flores the quietest, so the most requested routes report has an order.
export const ROUTE_DEMAND: Readonly<Record<string, number>> = {
  'GUA-ANT': 0.9,
  'ANT-GUA': 0.8,
  'GUA-XEL': 0.7,
  'XEL-GUA': 0.6,
  'GUA-COB': 0.45,
  'COB-GUA': 0.4,
  'XEL-HUE': 0.35,
  'HUE-XEL': 0.3,
  'XEL-ANT': 0.25,
  'ANT-XEL': 0.2,
  'GUA-FLO': 0.2,
  'FLO-GUA': 0.15,
};

const WALK_IN_NAMES: readonly string[] = [
  'Rigoberto Cux Tzoy',
  'Elvira Santizo Xol',
  'Julio César Gómez',
  'Dora Alicia Hernández',
  'Mario Estuardo Pérez',
  'Olga Marina Tzul',
];

export type Buyer =
  { kind: 'client'; number: number } | { kind: 'walk-in'; name: string | null; withEmail: boolean };

export interface PlannedSale {
  channel: 'ONLINE' | 'COUNTER';
  // Also the idempotency key of the sale, so the same trip never sells the same seats twice.
  ticketId: string;
  trip: AvailableTrip;
  seats: number[];
  buyer: Buyer;
}

const codeOf = (label: string): string =>
  SEED_BRANCHES.find((branch) => branch.name === label)?.code ?? label;

const demandOf = (trip: AvailableTrip): number =>
  ROUTE_DEMAND[`${codeOf(trip.originLabel)}-${codeOf(trip.destinationLabel)}`] ?? DEFAULT_DEMAND;

const pickNumber = (text: string): number => 1 + Math.floor(fraction(text) * SEED_CLIENTS.length);

function counterBuyer(tripId: string): Buyer {
  const kind = fraction(`buyer:${tripId}`);
  if (kind < CLIENT_AT_COUNTER)
    return { kind: 'client', number: pickNumber(`client:counter:${tripId}`) };
  const named = kind < NAMED_AT_COUNTER;
  const name = WALK_IN_NAMES[Math.floor(fraction(`name:${tripId}`) * WALK_IN_NAMES.length)];
  return {
    kind: 'walk-in',
    name: named && name ? name : null,
    withEmail: fraction(`email:${tripId}`) < WITH_EMAIL,
  };
}

function sale(trip: AvailableTrip, channel: PlannedSale['channel']): PlannedSale | null {
  const text = channel === 'ONLINE' ? 'online' : 'counter';
  if (fraction(`${text}:${trip.tripId}`) >= demandOf(trip) * SALE_RATE) return null;
  const first = channel === 'ONLINE' ? ONLINE_FIRST_SEAT : COUNTER_FIRST_SEAT;
  const count = 1 + Math.floor(fraction(`seats:${text}:${trip.tripId}`) * MAX_SEATS);
  const seats = Array.from({ length: count }, (_, index) => first + index);
  if ((seats.at(-1) ?? 0) > trip.capacity) return null;
  return {
    channel,
    ticketId: uuidFrom(`ticket:${text}:${trip.tripId}`),
    trip,
    seats,
    buyer:
      channel === 'ONLINE'
        ? { kind: 'client', number: pickNumber(`client:${trip.tripId}`) }
        : counterBuyer(trip.tripId),
  };
}

// Which of the trips on sale sell, to whom and how many seats. Only the trip decides, never the
// day of the load, so a second run plans the same sales for the trips it has seen before.
export function planSales(
  trips: readonly AvailableTrip[],
  { today }: { today: string },
): PlannedSale[] {
  const firstDay = addDays(today, SALE_FROM_DAYS_AHEAD);
  return trips
    .filter((trip) => todayInGuatemala(new Date(trip.departureAt)) >= firstDay)
    .sort((a, b) => a.departureAt.localeCompare(b.departureAt) || a.tripId.localeCompare(b.tripId))
    .flatMap((trip) => [sale(trip, 'ONLINE'), sale(trip, 'COUNTER')])
    .filter((planned): planned is PlannedSale => planned !== null);
}
