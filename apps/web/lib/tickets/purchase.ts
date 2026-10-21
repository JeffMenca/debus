import { ApiError } from '@/lib/api/client';

// How often a purchase still being confirmed is asked about, and for how long.
export const PURCHASE_POLL_MS = 3_000;
export const PURCHASE_WAIT_MS = 120_000;

const FEW_SEATS = 5;

// In cents, so Q 100.10 - Q 100.05 is Q 0.05 and not Q 0.04999...
export const balanceAfter = (balance: number, total: number): number =>
  (Math.round(balance * 100) - Math.round(total * 100)) / 100;

export const ticketCode = (ticketId: string): string =>
  `BOL-${ticketId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

// Only a lost answer may be retried as the same purchase; any answer of the server settles the key.
export const keepsKey = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 0;

export type SeatsTone = 'plenty' | 'few' | 'none';

export interface SeatsLeft {
  label: string;
  tone: SeatsTone;
  // The share of the bus already sold, which fills the bar.
  taken: number;
}

export function seatsLeft(free: number, capacity: number): SeatsLeft {
  const taken = (capacity - free) / capacity;
  if (free === 0) return { label: 'Sin asientos libres', tone: 'none', taken };
  if (free <= FEW_SEATS) {
    return { label: free === 1 ? '¡Solo queda 1!' : `¡Solo quedan ${free}!`, tone: 'few', taken };
  }
  return { label: `${free} de ${capacity} libres`, tone: 'plenty', taken };
}

const MINUTE_MS = 60_000;

export function tripDuration(departureIso: string, arrivalIso: string): string {
  const minutes = Math.round((Date.parse(arrivalIso) - Date.parse(departureIso)) / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export type PartOfDay = 'Madrugada' | 'Mañana' | 'Mediodía' | 'Tarde' | 'Noche';

// From a departure time written HH:MM in Guatemala.
export function partOfDay(time: string): PartOfDay {
  const hour = Number(time.slice(0, 2));
  if (hour < 6) return 'Madrugada';
  if (hour < 12) return 'Mañana';
  if (hour < 14) return 'Mediodía';
  if (hour < 19) return 'Tarde';
  return 'Noche';
}
