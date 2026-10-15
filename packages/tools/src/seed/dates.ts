const DAY_MS = 86_400_000;

// Calendar arithmetic on YYYY-MM-DD strings, without time zones.
export const addDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
