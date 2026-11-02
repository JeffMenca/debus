import {
  ARCHITECTURE_UNITS,
  type ArchitectureFilter,
  type ArchitectureUnit,
  EVENT_TYPES,
  type EventType,
  type PageQuery,
} from '@debus/contracts';
import { readPage, writePage } from '@/lib/list/page-params';
import { reportSearch } from '@/lib/reports/search';

export interface ArchitectureView extends PageQuery, ArchitectureFilter {}

const isUnit = (raw: string | null): raw is ArchitectureUnit =>
  (ARCHITECTURE_UNITS as readonly string[]).includes(raw ?? '');
const isEvent = (raw: string | null): raw is EventType =>
  (EVENT_TYPES as readonly string[]).includes(raw ?? '');

export function readArchitectureParams(search: URLSearchParams): ArchitectureView {
  const service = search.get('servicio');
  const event = search.get('evento');
  return {
    ...(isUnit(service) && { service }),
    ...(isEvent(event) && { event }),
    ...readPage(search),
  };
}

export function writeArchitectureParams(view: ArchitectureView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.service) params.set('servicio', view.service);
  if (view.event) params.set('evento', view.event);
  writePage(params, view);
  return params;
}

export const ARCHITECTURE_REPORT_PARAMS = {
  read: readArchitectureParams,
  write: writeArchitectureParams,
  toSearch: ({ service, event, page, pageSize }: ArchitectureView): URLSearchParams =>
    reportSearch({ service, event, page, pageSize }),
};
