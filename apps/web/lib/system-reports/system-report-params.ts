import type { PageQuery } from '@debus/contracts';
import { readId, readPage, writePage } from '@/lib/list/page-params';
import { type ReportRange, readRange, writeRange } from '@/lib/reports/range';
import { reportSearch } from '@/lib/reports/search';

// The period and the branch every report of the system administrator can narrow by.
export interface SystemReportView extends PageQuery, ReportRange {
  branchId?: string;
}

export function readSystemReportParams(search: URLSearchParams): SystemReportView {
  const branchId = readId(search.get('sucursal'));
  return { ...readPage(search), ...readRange(search), ...(branchId && { branchId }) };
}

export function writeSystemReportParams(view: SystemReportView): URLSearchParams {
  const params = new URLSearchParams();
  writeRange(params, view);
  if (view.branchId) params.set('sucursal', view.branchId);
  writePage(params, view);
  return params;
}

// The same names as the contract of the reports, which is what the API and its PDF read.
export const systemReportSearch = (view: SystemReportView): URLSearchParams =>
  reportSearch({
    from: view.from,
    to: view.to,
    branchId: view.branchId,
    page: view.page,
    pageSize: view.pageSize,
  });

// How a report that narrows only by period and branch keeps its filters in the address.
export const SYSTEM_REPORT_PARAMS = {
  read: readSystemReportParams,
  write: writeSystemReportParams,
  toSearch: systemReportSearch,
};
