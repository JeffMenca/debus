import type { ExpenseCategoryListQuery, PageQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface CategoryListView extends PageQuery {
  status: ExpenseCategoryListQuery['status'];
  q?: string;
}

const DEFAULT_STATUS: CategoryListView['status'] = 'active';
const STATUS = enumParam<CategoryListView['status']>({
  active: 'activas',
  inactive: 'inactivas',
  all: 'todas',
});

export function readCategoryListParams(search: URLSearchParams): CategoryListView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeCategoryListParams(view: CategoryListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
