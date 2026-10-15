import type { PageQuery } from '@debus/contracts';
import { readId, readPage, writePage } from '@/lib/list/page-params';
import { type ReportRange, readRange, writeRange } from '@/lib/reports/range';
import { reportSearch } from '@/lib/reports/search';

export interface RepairReportView extends PageQuery, ReportRange {
  busId?: string;
  categoryId?: string;
}

export function readRepairReportParams(search: URLSearchParams): RepairReportView {
  const busId = readId(search.get('bus'));
  const categoryId = readId(search.get('categoria'));
  return {
    ...readPage(search),
    ...readRange(search),
    ...(busId && { busId }),
    ...(categoryId && { categoryId }),
  };
}

export function writeRepairReportParams(view: RepairReportView): URLSearchParams {
  const params = new URLSearchParams();
  writeRange(params, view);
  if (view.busId) params.set('bus', view.busId);
  if (view.categoryId) params.set('categoria', view.categoryId);
  writePage(params, view);
  return params;
}

// The same names as the contract of the report, which is what the API and its PDF read.
export const repairReportSearch = (view: RepairReportView): URLSearchParams =>
  reportSearch({
    from: view.from,
    to: view.to,
    busId: view.busId,
    categoryId: view.categoryId,
    page: view.page,
    pageSize: view.pageSize,
  });
