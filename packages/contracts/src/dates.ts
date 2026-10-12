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
