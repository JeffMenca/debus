import { GUATEMALA_TIME_ZONE } from '@debus/contracts';

const number = (fractionDigits: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
const money = number(2);
const whole = number(0);

// Written out instead of asking the ICU data of the runtime, which spells some months differently
// from one Node release to the next ("sep." or "sept").
const MONTHS = [
  'ene.',
  'feb.',
  'mar.',
  'abr.',
  'may.',
  'jun.',
  'jul.',
  'ago.',
  'sep.',
  'oct.',
  'nov.',
  'dic.',
];

const instantParts = new Intl.DateTimeFormat('en-US', {
  timeZone: GUATEMALA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const formatMoney = (amount: number): string => `Q ${money.format(amount)}`;

export const formatKm = (km: number): string => `${whole.format(km)} km`;

export function formatDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function formatInstant(instant: string | Date): string {
  const parts = Object.fromEntries(
    instantParts.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function reportPeriod(from?: string, to?: string): string {
  if (from && to) return `Del ${formatDay(from)} al ${formatDay(to)}`;
  if (from) return `Desde el ${formatDay(from)}`;
  if (to) return `Hasta el ${formatDay(to)}`;
  return 'Todos los registros';
}
