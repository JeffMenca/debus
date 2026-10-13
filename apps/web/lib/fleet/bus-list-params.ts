import type { BusListQuery, PageQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface BusListView extends PageQuery {
  status: BusListQuery['status'];
  q?: string;
}

const DEFAULT_STATUS: BusListView['status'] = 'all';
const STATUS = enumParam<BusListView['status']>({
  all: '',
  IN_TRANSIT: 'en-camino',
  AVAILABLE: 'disponibles',
  IN_WORKSHOP: 'en-taller',
  INACTIVE: 'inactivos',
});

export function readBusListParams(search: URLSearchParams): BusListView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeBusListParams(view: BusListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
