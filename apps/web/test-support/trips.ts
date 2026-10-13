import type { Trip } from '@debus/contracts';
import { BRANCH_ID } from './fleet';

export const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 'c1d2e3f4-0a1b-4c2d-8e3f-a1b2c3d4e5f6',
  type: 'REGULAR',
  status: 'SCHEDULED',
  branchId: BRANCH_ID,
  routeId: 'a3b6e7d4-2c1f-4d0e-8b7a-0e5f4c3d2b1a',
  originName: 'Quetzaltenango',
  destinationName: 'Guatemala',
  busId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  busPlate: 'C482BTX',
  driverId: '0b1f1f2e-5c2d-4a8e-9e51-6f3f7a6f3a11',
  driverName: 'Julio Pérez',
  // 05:30 in Guatemala
  departureAt: '2026-10-20T11:30:00.000Z',
  estimatedArrivalAt: '2026-10-20T16:30:00.000Z',
  ticketPrice: 85,
  capacity: 40,
  ...over,
});

export const tripPage = (items: Trip[], over: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  ...over,
});
