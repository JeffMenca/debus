import { z } from 'zod';

export const GUATEMALA_TIME_ZONE = 'America/Guatemala';
export const isoDateSchema = z.iso.date();

// en-CA formats as YYYY-MM-DD, the same shape as isoDateSchema and <input type="date">.
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: GUATEMALA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInGuatemala(now: Date = new Date()): string {
  return dayFormat.format(now);
}

// ISO strings of different precision (`...:00Z` and `...:00.000Z`) are not comparable as text.
export const isLaterInstant = (later: string, earlier: string): boolean =>
  Date.parse(later) > Date.parse(earlier);

// Guatemala has no daylight saving time: it is always UTC-6.
const GUATEMALA_OFFSET = '-06:00';
const DAY_MS = 86_400_000;

export const guatemalaDateTime = (day: string, time: string): string =>
  new Date(`${day}T${time}:00${GUATEMALA_OFFSET}`).toISOString();

// The instants that cover whole Guatemalan days, so a trip at 23:30 local belongs to its own day.
export function guatemalaDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  return {
    ...(from && { gte: new Date(`${from}T00:00:00${GUATEMALA_OFFSET}`) }),
    ...(to && { lt: new Date(new Date(`${to}T00:00:00${GUATEMALA_OFFSET}`).getTime() + DAY_MS) }),
  };
}
