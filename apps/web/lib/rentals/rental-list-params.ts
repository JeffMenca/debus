import type { PageQuery, RentalListQuery } from '@debus/contracts';
import { enumParam, readDay, readPage, readSearch, writePage } from '@/lib/list/page-params';

export type BranchRentalStatus = RentalListQuery['status'];

export interface BranchRentalQuery extends PageQuery {
  status: BranchRentalStatus;
  q?: string;
  from?: string;
  to?: string;
}

// The branch opens on what needs it: the requests still waiting for their price.
const DEFAULT_STATUS: BranchRentalStatus = 'REQUESTED';
const STATUS = enumParam<BranchRentalStatus>({
  REQUESTED: 'por-confirmar',
  CONFIRMED: 'esperando-pago',
  PAID: 'pagados',
  CANCELLED: 'cancelados',
  all: 'todos',
});

export function readBranchRentalParams(search: URLSearchParams): BranchRentalQuery {
  const q = readSearch(search.get('buscar'));
  const from = readDay(search.get('desde'));
  const to = readDay(search.get('hasta'));
  return {
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
    ...(from && { from }),
    ...(to && { to }),
    ...readPage(search),
  };
}

export function writeBranchRentalParams(view: BranchRentalQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  if (view.from) params.set('desde', view.from);
  if (view.to) params.set('hasta', view.to);
  writePage(params, view);
  return params;
}

export const branchRentalsHref = (status: BranchRentalStatus): string => {
  const params = writeBranchRentalParams({ status, page: 1, pageSize: 20 }).toString();
  return `/sucursal/alquileres${params ? `?${params}` : ''}`;
};
