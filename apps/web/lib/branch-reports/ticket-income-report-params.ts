import type { PageQuery } from '@debus/contracts';
import { readId, readPage, writePage } from '@/lib/list/page-params';
import { type ReportRange, readRange, writeRange } from '@/lib/reports/range';
import { reportSearch } from '@/lib/reports/search';

export interface TicketIncomeReportView extends PageQuery, ReportRange {
  routeId?: string;
  busId?: string;
}

export function readTicketIncomeReportParams(search: URLSearchParams): TicketIncomeReportView {
  const routeId = readId(search.get('ruta'));
  const busId = readId(search.get('bus'));
  return {
    ...readPage(search),
    ...readRange(search),
    ...(routeId && { routeId }),
    ...(busId && { busId }),
  };
}

export function writeTicketIncomeReportParams(view: TicketIncomeReportView): URLSearchParams {
  const params = new URLSearchParams();
  writeRange(params, view);
  if (view.routeId) params.set('ruta', view.routeId);
  if (view.busId) params.set('bus', view.busId);
  writePage(params, view);
  return params;
}

// The same names as the contract of the report, which is what the API and its PDF read.
export const ticketIncomeReportSearch = (view: TicketIncomeReportView): URLSearchParams =>
  reportSearch({
    from: view.from,
    to: view.to,
    routeId: view.routeId,
    busId: view.busId,
    page: view.page,
    pageSize: view.pageSize,
  });
