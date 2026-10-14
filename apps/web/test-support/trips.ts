import type { RentalToAssign, Trip, TripDetail } from '@debus/contracts';
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

export const tripDetail = (over: Partial<TripDetail> = {}): TripDetail => ({
  ...trip(),
  distanceKm: 201,
  busActive: true,
  driverActive: true,
  suggestedStartMileageKm: 148410,
  depreciationPerKmToday: 0.85,
  expectedDriverPay: 250,
  canDelete: true,
  departure: null,
  arrival: null,
  ...over,
});

export const departureRecord = (
  over: Partial<NonNullable<TripDetail['departure']>> = {},
): NonNullable<TripDetail['departure']> => ({
  departedAt: '2026-10-20T11:34:00.000Z',
  startMileageKm: 148410,
  recordedByRole: 'BRANCH_ADMIN',
  ...over,
});

export const arrivalRecord = (
  over: Partial<NonNullable<TripDetail['arrival']>> = {},
): NonNullable<TripDetail['arrival']> => ({
  arrivedAt: '2026-10-20T15:52:00.000Z',
  endMileageKm: 148614,
  fuelCost: 1180,
  distanceKm: 204,
  depreciationPerKm: 0.85,
  depreciationAmount: 173.4,
  driverPay: 250,
  recordedByRole: 'DRIVER',
  ...over,
});

export const rentalRequest = (over: Partial<RentalToAssign> = {}): RentalToAssign => ({
  id: '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  branchId: BRANCH_ID,
  clientName: 'Colegio San José',
  nit: '1234567-8',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Antigua Guatemala',
  // 06:00 in Guatemala
  departureAt: '2026-10-24T12:00:00.000Z',
  returnAt: '2026-10-24T22:00:00.000Z',
  passengers: 38,
  distanceKm: 210,
  price: 6300,
  status: 'PENDING',
  tripId: null,
  ...over,
});
