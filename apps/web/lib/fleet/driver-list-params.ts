import type { DriverListQuery, PageQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface DriverListView extends PageQuery {
  status: DriverListQuery['status'];
  q?: string;
}

const DEFAULT_STATUS: DriverListView['status'] = 'active';
const STATUS = enumParam<DriverListView['status']>({
  active: 'activos',
  inactive: 'inactivos',
  all: 'todos',
});

export function readDriverListParams(search: URLSearchParams): DriverListView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeDriverListParams(view: DriverListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
