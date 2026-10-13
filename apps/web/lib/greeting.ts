import { GUATEMALA_TIME_ZONE } from '@debus/contracts';

const HOUR = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: GUATEMALA_TIME_ZONE,
});
const MIDDAY = 12;
const EVENING = 19;

export type Greeting = 'Buenos días' | 'Buenas tardes' | 'Buenas noches';

export function greetingFor(date: Date = new Date()): Greeting {
  const hour = Number(HOUR.format(date));
  if (hour < MIDDAY) return 'Buenos días';
  return hour < EVENING ? 'Buenas tardes' : 'Buenas noches';
}

// UTC on purpose: an ISO day is a calendar day, and a local zone could show the day before.
const DAY_HEADING = new Intl.DateTimeFormat('es-GT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

// "Lunes 5 de octubre"
export function longDayHeading(isoDay: string): string {
  const text = DAY_HEADING.format(new Date(`${isoDay}T00:00:00.000Z`)).replace(',', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
