import type { BranchDriversQuery, PageQuery } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';
import { reportSearch } from '@/lib/reports/search';

export interface DriverReportView extends PageQuery {
  status: BranchDriversQuery['status'];
  q?: string;
}

const DEFAULT_STATUS: DriverReportView['status'] = 'all';
const STATUS = enumParam<DriverReportView['status']>({
  all: '',
  active: 'activos',
  inactive: 'inactivos',
});

export function readDriverReportParams(search: URLSearchParams): DriverReportView {
  const q = readSearch(search.get('buscar'));
  return {
    ...readPage(search),
    status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS,
    ...(q && { q }),
  };
}

export function writeDriverReportParams(view: DriverReportView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}

// The same names as the contract of the report, which is what the API and its PDF read.
export const driverReportSearch = (view: DriverReportView): URLSearchParams =>
  reportSearch({
    status: view.status,
    q: view.q,
    page: view.page,
    pageSize: view.pageSize,
  });
