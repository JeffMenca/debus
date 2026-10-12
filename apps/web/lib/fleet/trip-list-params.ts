import { type PageQuery, type TripListQuery, todayInGuatemala } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface TripQuery extends PageQuery {
  from?: string;
  to?: string;
  status: TripListQuery['status'];
  q?: string;
}

// What the list screen asks for: it always has a first day, today when the address does not say,
// so the list opens on what is next.
export interface TripListView extends TripQuery {
  from: string;
}

const DEFAULT_STATUS: TripListView['status'] = 'all';
const STATUS = enumParam<TripListView['status']>({
  all: '',
  SCHEDULED: 'programados',
  IN_TRANSIT: 'en-camino',
  COMPLETED: 'completados',
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const readDay = (raw: string | null): string | undefined =>
  raw && ISO_DAY.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : undefined;

export function readTripListParams(
  search: URLSearchParams,
  today: string = todayInGuatemala(),
): TripListView {
  const from = readDay(search.get('desde')) ?? today;
  const to = readDay(search.get('hasta'));
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    from,
    ...(to && to >= from && { to }),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeTripListParams(
  view: TripListView,
  today: string = todayInGuatemala(),
): URLSearchParams {
  const params = new URLSearchParams();
  if (view.from !== today) params.set('desde', view.from);
  if (view.to) params.set('hasta', view.to);
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
