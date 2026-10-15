import type { PageQuery } from '@debus/contracts';
import { readPage, readSearch, writePage } from '@/lib/list/page-params';
import { type ReportRange, readRange, writeRange } from '@/lib/reports/range';
import { reportSearch } from '@/lib/reports/search';

export interface DepreciationReportView extends PageQuery, ReportRange {
  q?: string;
}

export function readDepreciationReportParams(search: URLSearchParams): DepreciationReportView {
  const q = readSearch(search.get('buscar'));
  return { ...readPage(search), ...readRange(search), ...(q && { q }) };
}

export function writeDepreciationReportParams(view: DepreciationReportView): URLSearchParams {
  const params = new URLSearchParams();
  writeRange(params, view);
  if (view.q) params.set('buscar', view.q);
  writePage(params, view);
  return params;
}

// The same names as the contract of the report, which is what the API and its PDF read.
export const depreciationReportSearch = (view: DepreciationReportView): URLSearchParams =>
  reportSearch({
    from: view.from,
    to: view.to,
    q: view.q,
    page: view.page,
    pageSize: view.pageSize,
  });
