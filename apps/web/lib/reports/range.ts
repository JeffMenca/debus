import { readDay } from '@/lib/list/page-params';

export interface ReportRange {
  from?: string;
  to?: string;
}

// Written out instead of asking the ICU data of the browser, which spells some months differently
// from one release to the next.
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

function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

export function rangeLabel({ from, to }: ReportRange): string {
  if (from && to) return `${dayLabel(from)} – ${dayLabel(to)}`;
  if (from) return `Desde el ${dayLabel(from)}`;
  if (to) return `Hasta el ${dayLabel(to)}`;
  return 'Todos los registros';
}

// A strange value in the address goes back to "every record", like any other filter.
export function readRange(search: URLSearchParams): ReportRange {
  const from = readDay(search.get('desde'));
  const to = readDay(search.get('hasta'));
  return { ...(from && { from }), ...(to && (!from || to >= from) && { to }) };
}

export function writeRange(params: URLSearchParams, { from, to }: ReportRange): void {
  if (from) params.set('desde', from);
  if (to) params.set('hasta', to);
}
