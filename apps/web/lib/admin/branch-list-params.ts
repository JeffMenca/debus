import type { BranchListStatus, PageQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

export interface BranchListView extends PageQuery {
  status: BranchListStatus;
  q?: string;
}

const DEFAULT_STATUS: BranchListStatus = 'active';
const STATUS = enumParam<BranchListStatus>({
  active: 'activas',
  inactive: 'inactivas',
  all: 'todas',
});

export function readBranchListParams(search: URLSearchParams): BranchListView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeBranchListParams(view: BranchListView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}
