import type { Bus, Driver, Route } from '@debus/contracts';

export const BRANCH_ID = '9b2c7a10-1111-4c4c-8888-123456789abc';
export const OTHER_BRANCH_ID = '3e8a1b30-3333-4e4e-aaaa-123456789abc';

export const bus = (over: Partial<Bus> = {}): Bus => ({
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  branchId: BRANCH_ID,
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 148410,
  operationalStatus: 'AVAILABLE',
  assignedDriverId: null,
  assignedDriverName: null,
  active: true,
  displayStatus: 'AVAILABLE',
  completedTrips: 612,
  hasPhoto: false,
  version: 1,
  ...over,
});

export const driver = (over: Partial<Driver> = {}): Driver => ({
  id: '0b1f1f2e-5c2d-4a8e-9e51-6f3f7a6f3a11',
  branchId: BRANCH_ID,
  fullName: 'Julio Pérez',
  email: 'julio@correo.com',
  phone: '55512345',
  licenseNumber: 'A1234567',
  licenseType: 'C',
  licenseExpiresOn: '2027-03-04',
  baseSalary: 150,
  active: true,
  assignedBusPlate: null,
  completedTrips: 12,
  hasPhoto: false,
  version: 1,
  ...over,
});

export const route = (over: Partial<Route> = {}): Route => ({
  id: 'a3b6e7d4-2c1f-4d0e-8b7a-0e5f4c3d2b1a',
  originBranchId: BRANCH_ID,
  originName: 'Quetzaltenango',
  destinationBranchId: OTHER_BRANCH_ID,
  destinationName: 'Guatemala',
  distanceKm: 206.5,
  ticketPrice: 85,
  active: true,
  hasTrips: false,
  version: 1,
  ...over,
});

export const busPage = (items: Bus[], over: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: { statusCounts: { IN_TRANSIT: 2, AVAILABLE: 3, IN_WORKSHOP: 1, INACTIVE: 1 } },
  ...over,
});

export const driverPage = (items: Driver[], over: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: { statusCounts: { active: 5, inactive: 2 } },
  ...over,
});

export const routePage = (items: Route[], over: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: { statusCounts: { active: 4, inactive: 1 } },
  ...over,
});
