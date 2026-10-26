import { fraction } from './ids';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Calendar arithmetic on YYYY-MM-DD strings, without time zones.
export const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

// How far back a demo sale may be dated: people buy ahead, and the reports then differ by period.
export const PAID_ON_SPREAD_DAYS = 14;

// A payment date between today and 13 days ago, fixed for the same key.
export const paidOnFor = (today: string, key: string): string =>
  addDays(today, -Math.floor(fraction(`paid-on:${key}`) * PAID_ON_SPREAD_DAYS));
