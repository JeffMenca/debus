import type { PageQuery, TripStatus } from '@debus/contracts';
import { enumParam, readPage, writePage } from '@/lib/list/page-params';

export interface DriverTripView extends PageQuery {
  status: TripStatus;
}

// A driver sees only their own trips, so the list has no days or search: just the state of the trip.
const DEFAULT_STATUS: TripStatus = 'SCHEDULED';
const STATUS = enumParam<TripStatus>({
  SCHEDULED: 'proximos',
  IN_TRANSIT: 'en-ruta',
  COMPLETED: 'completados',
});

export function readDriverTripParams(search: URLSearchParams): DriverTripView {
  return { ...readPage(search), status: STATUS.read(search.get('estado')) ?? DEFAULT_STATUS };
}

export function writeDriverTripParams(view: DriverTripView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.status !== DEFAULT_STATUS) params.set('estado', STATUS.write(view.status) ?? '');
  writePage(params, view);
  return params;
}
