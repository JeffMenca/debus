import { type PageQuery, todayInGuatemala } from '@debus/contracts';
import { readPage, readSearch, writePage } from '@/lib/list/page-params';

// The trips a counter can sell: from a day on (today when the address does not say) and a search.
export interface CounterQuery extends PageQuery {
  from: string;
  q?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const readDay = (raw: string | null): string | undefined =>
  raw && ISO_DAY.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : undefined;

export function readCounterParams(
  search: URLSearchParams,
  today: string = todayInGuatemala(),
): CounterQuery {
  const q = readSearch(search.get('buscar'));
  return { ...readPage(search), from: readDay(search.get('desde')) ?? today, ...(q && { q }) };
}

export function writeCounterParams(
  query: CounterQuery,
  today: string = todayInGuatemala(),
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.from !== today) params.set('desde', query.from);
  if (query.q) params.set('buscar', query.q);
  writePage(params, query);
  return params;
}
