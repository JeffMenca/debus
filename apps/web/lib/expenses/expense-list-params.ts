import type { PageQuery } from '@debus/contracts';
import { readDay, readId, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface ExpenseListView extends PageQuery {
  busId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
}

// Every filter starts open: all buses, all categories and all dates.
export function readExpenseListParams(search: URLSearchParams): ExpenseListView {
  const from = readDay(search.get('desde'));
  const to = readDay(search.get('hasta'));
  const busId = readId(search.get('bus'));
  const categoryId = readId(search.get('categoria'));
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    ...(busId && { busId }),
    ...(categoryId && { categoryId }),
    ...(from && { from }),
    ...(to && (!from || to >= from) && { to }),
    ...(q && { q }),
  };
}

export function writeExpenseListParams(view: ExpenseListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.busId) params.set('bus', view.busId);
  if (view.categoryId) params.set('categoria', view.categoryId);
  if (view.from) params.set('desde', view.from);
  if (view.to) params.set('hasta', view.to);
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
