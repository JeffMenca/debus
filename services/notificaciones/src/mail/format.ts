import { GUATEMALA_TIME_ZONE } from '@debus/contracts';

const dateTime = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: GUATEMALA_TIME_ZONE,
});
// A calendar date is midnight UTC: formatting it in UTC keeps its day.
const calendarDate = new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'UTC' });
const money = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
const list = new Intl.ListFormat('es', { type: 'conjunction' });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));

export const formatDate = (isoDate: string): string =>
  calendarDate.format(new Date(`${isoDate}T00:00:00.000Z`));

export const formatMoney = (amount: number): string => money.format(amount);

export function formatSeats(seats: readonly number[]): string {
  const sorted = [...seats].sort((a, b) => a - b).map(String);
  return sorted.length === 1 ? `asiento ${sorted[0]}` : `asientos ${list.format(sorted)}`;
}
