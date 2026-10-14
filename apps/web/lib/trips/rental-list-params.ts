import type { PageQuery, RentalRequestListQuery } from '@debus/contracts';
import { readPage, readSearch, writePage } from '@/lib/list/page-params';

export const TAB_PARAM = 'pestana';
export const RENTALS_TAB = 'alquileres';

export interface RentalQuery extends PageQuery {
  status: RentalRequestListQuery['status'];
  q?: string;
}

// The trips screen has two tabs in one address; this one is chosen by `pestana=alquileres`.
export const isRentalsTab = (search: URLSearchParams): boolean =>
  search.get(TAB_PARAM) === RENTALS_TAB;

// The tab lists only the rentals still waiting for a bus and a driver.
export function readRentalListParams(search: URLSearchParams): RentalQuery {
  const q = readSearch(search.get('buscar'));
  return { ...readPage(search), status: 'PENDING', ...(q && { q }) };
}

export function writeRentalListParams(view: RentalQuery): URLSearchParams {
  const params = new URLSearchParams({ [TAB_PARAM]: RENTALS_TAB });
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
