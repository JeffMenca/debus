import { DEFAULT_PAGE_SIZE, type PageQuery } from '@debus/contracts';
import { readId } from '@/lib/list/page-params';
import { reportSearch } from '@/lib/reports/search';

// The map has no pages; it keeps the shape of the other views so it can share the address hook.
export interface RoutesMapView extends PageQuery {
  branchId?: string;
}

export function readRoutesMapParams(search: URLSearchParams): RoutesMapView {
  const branchId = readId(search.get('sucursal'));
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE, ...(branchId && { branchId }) };
}

export function writeRoutesMapParams({ branchId }: RoutesMapView): URLSearchParams {
  const params = new URLSearchParams();
  if (branchId) params.set('sucursal', branchId);
  return params;
}

export const routesMapSearch = (branchId: string | undefined): URLSearchParams =>
  reportSearch({ branchId });
