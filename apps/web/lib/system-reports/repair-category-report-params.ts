import { readId, writePage } from '@/lib/list/page-params';
import { writeRange } from '@/lib/reports/range';
import { reportSearch } from '@/lib/reports/search';
import {
  type SystemReportView,
  readSystemReportParams,
  systemReportSearch,
} from './system-report-params';

export interface RepairCategoryView extends SystemReportView {
  busId?: string;
}

export function readRepairCategoryParams(search: URLSearchParams): RepairCategoryView {
  const busId = readId(search.get('bus'));
  return { ...readSystemReportParams(search), ...(busId && { busId }) };
}

export function writeRepairCategoryParams(view: RepairCategoryView): URLSearchParams {
  const params = new URLSearchParams();
  writeRange(params, view);
  if (view.branchId) params.set('sucursal', view.branchId);
  if (view.busId) params.set('bus', view.busId);
  writePage(params, view);
  return params;
}

export const repairCategorySearch = (view: RepairCategoryView): URLSearchParams =>
  reportSearch({ ...Object.fromEntries(systemReportSearch(view)), busId: view.busId });
