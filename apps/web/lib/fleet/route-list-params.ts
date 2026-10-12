import type { PageQuery, RouteListQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface RouteListView extends PageQuery {
  status: RouteListQuery['status'];
  q?: string;
}

const DEFAULT_STATUS: RouteListView['status'] = 'active';
const STATUS = enumParam<RouteListView['status']>({
  active: 'activas',
  inactive: 'retiradas',
  all: 'todas',
});

export function readRouteListParams(search: URLSearchParams): RouteListView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeRouteListParams(view: RouteListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
