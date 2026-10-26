import { type PageQuery, SEAT_SELECTION_MAX, todayInGuatemala } from '@debus/contracts';
import { readDay, readPage, writePage } from '@/lib/list/page-params';

// What a client searches: where from and to (anywhere when empty), the day and how many travel.
export interface TripSearch extends PageQuery {
  origin?: string;
  destination?: string;
  date: string;
  passengers: number;
}

const PLACE_MAX_LENGTH = 120;
const ONE_PASSENGER = 1;
const STRIP_DAYS = 6;
const DAY_MS = 86_400_000;

const readPlace = (raw: string | null): string | undefined => {
  const place = raw?.trim();
  return place && place.length <= PLACE_MAX_LENGTH ? place : undefined;
};

// A whole count from 1 to the most seats one sale carries; anything else is null.
export function readPassengerCount(raw: string | null): number | null {
  const passengers = Number(raw);
  return Number.isInteger(passengers) && passengers >= 1 && passengers <= SEAT_SELECTION_MAX
    ? passengers
    : null;
}

export function readTripSearch(
  search: URLSearchParams,
  today: string = todayInGuatemala(),
): TripSearch {
  const origin = readPlace(search.get('origen'));
  const destination = readPlace(search.get('destino'));
  return {
    ...(origin && { origin }),
    ...(destination && { destination }),
    date: readDay(search.get('fecha')) ?? today,
    passengers: readPassengerCount(search.get('pasajeros')) ?? ONE_PASSENGER,
    ...readPage(search),
  };
}

export function writeTripSearch(
  query: TripSearch,
  today: string = todayInGuatemala(),
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.origin) params.set('origen', query.origin);
  if (query.destination) params.set('destino', query.destination);
  if (query.date !== today) params.set('fecha', query.date);
  if (query.passengers !== ONE_PASSENGER) params.set('pasajeros', String(query.passengers));
  writePage(params, query);
  return params;
}

// One passenger asks for no room, so a sold out trip still shows, as sold out.
export function toTripListQuery({
  date,
  passengers,
  origin,
  destination,
  page,
  pageSize,
}: TripSearch) {
  return {
    from: date,
    to: date,
    ...(origin && { origin }),
    ...(destination && { destination }),
    ...(passengers > ONE_PASSENGER && { seats: passengers }),
    page,
    pageSize,
  };
}

const isoDayAfter = (isoDay: string, days: number): string =>
  new Date(Date.parse(`${isoDay}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const weekStrip = (from: string): string[] =>
  Array.from({ length: STRIP_DAYS }, (_, index) => isoDayAfter(from, index));

// The strip stays on the coming days while the chosen one is among them; otherwise it starts there.
export function stripStart(date: string, today: string = todayInGuatemala()): string {
  const coming = weekStrip(today);
  return coming.includes(date) ? today : date;
}

// UTC on purpose: an ISO date is a calendar day.
const WEEKDAY = new Intl.DateTimeFormat('es-GT', { weekday: 'short', timeZone: 'UTC' });
const FULL_DAY = new Intl.DateTimeFormat('es-GT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function dayChip(isoDay: string) {
  const date = new Date(`${isoDay}T00:00:00.000Z`);
  return {
    weekday: capitalized(WEEKDAY.format(date).replace('.', '')),
    day: String(date.getUTCDate()),
    label: FULL_DAY.format(date).replace(',', ''),
  };
}
