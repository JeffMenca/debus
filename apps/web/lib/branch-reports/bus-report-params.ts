import type { BranchBusesQuery, PageQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';
import { reportSearch } from '@/lib/reports/search';

export interface BusReportView extends PageQuery {
  status: BranchBusesQuery['status'];
  q?: string;
}

const DEFAULT_STATUS: BusReportView['status'] = 'all';
const STATUS = enumParam<BusReportView['status']>({
  all: '',
  IN_TRANSIT: 'en-ruta',
  AVAILABLE: 'disponibles',
  IN_WORKSHOP: 'en-taller',
  INACTIVE: 'inactivos',
});

export function readBusReportParams(search: URLSearchParams): BusReportView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeBusReportParams(view: BusReportView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}

// The same names as the contract of the report, which is what the API and its PDF read.
export const busReportSearch = (view: BusReportView): URLSearchParams =>
  reportSearch({
    status: view.status,
    q: view.q,
    page: view.page,
    pageSize: view.pageSize,
  });
