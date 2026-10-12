import { GUATEMALA_TIME_ZONE } from '@debus/contracts';

const COUNT = new Intl.NumberFormat('es-GT');
const QUETZALES = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
// UTC on purpose: an ISO date is a calendar day, and a local zone could show the day before.
const LONG_DATE = new Intl.DateTimeFormat('es-GT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function initialsOf(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export const formatCount = (value: number): string => COUNT.format(value);

export const formatQuetzales = (value: number): string => QUETZALES.format(value);

export const formatLongDate = (isoDate: string): string =>
  LONG_DATE.format(new Date(`${isoDate}T00:00:00.000Z`));

export const formatPhone = (phone: string): string =>
  /^\d{8}$/.test(phone) ? `${phone.slice(0, 4)}-${phone.slice(4)}` : phone;

const DATE_TIME = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: GUATEMALA_TIME_ZONE,
});

export const formatDateTime = (isoInstant: string): string =>
  DATE_TIME.format(new Date(isoInstant));
