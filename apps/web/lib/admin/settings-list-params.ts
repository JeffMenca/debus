import type { PageQuery } from '@debus/contracts';
import { readPage, writePage } from '@/lib/list/page-params';

export const readSettingsListParams = (search: URLSearchParams): PageQuery => readPage(search);

export function writeSettingsListParams(view: PageQuery): URLSearchParams {
  const params = new URLSearchParams();
  writePage(params, view);
  return params;
}
