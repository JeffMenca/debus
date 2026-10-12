import {
  type BusChangedPayload,
  type DriverChangedPayload,
  type RouteChangedPayload,
  type RouteDeletedPayload,
  busChangedPayloadSchema,
  driverChangedPayloadSchema,
  routeChangedPayloadSchema,
  routeDeletedPayloadSchema,
} from './fleet-payloads';

// Fixed ids so producers and consumers of both teams test against the very same example.
export const EXAMPLE_IDS = {
  branch: '9b2c7a10-1111-4c4c-8888-123456789abc',
  destination: '5d1f3a20-2222-4d4d-9999-123456789abc',
  bus: '1f0e2d3c-4b5a-4968-8776-655443322110',
  driver: '2a1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  route: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  trip: '4c3d2e1f-7a6b-4c5d-8e9f-0a1b2c3d4e5f',
} as const;

export const exampleBus: BusChangedPayload = {
  busId: EXAMPLE_IDS.bus,
  branchId: EXAMPLE_IDS.branch,
  plate: 'C482BTX',
  brand: 'Volvo',
  model: 'B8R',
  year: 2021,
  capacity: 40,
  mileageKm: 148410,
  operationalStatus: 'AVAILABLE',
  assignedDriverId: EXAMPLE_IDS.driver,
  active: true,
  version: 1,
};

export const exampleDriver: DriverChangedPayload = {
  driverId: EXAMPLE_IDS.driver,
  branchId: EXAMPLE_IDS.branch,
  fullName: 'Julio Pérez',
  email: 'julio.perez@example.com',
  phone: '55551234',
  licenseNumber: 'A1234567',
  licenseType: 'A',
  licenseExpiresOn: '2027-03-01',
  baseSalary: 350,
  active: true,
  version: 1,
};

export const exampleRoute: RouteChangedPayload = {
  routeId: EXAMPLE_IDS.route,
  originBranchId: EXAMPLE_IDS.branch,
  destinationBranchId: EXAMPLE_IDS.destination,
  distanceKm: 201.5,
  ticketPrice: 85,
  active: true,
  version: 1,
};

export const exampleRouteDeleted: RouteDeletedPayload = { routeId: EXAMPLE_IDS.route };

export const FLEET_PAYLOAD_SCHEMAS = {
  BusAdded: busChangedPayloadSchema,
  BusUpdated: busChangedPayloadSchema,
  BusDeactivated: busChangedPayloadSchema,
  DriverAdded: driverChangedPayloadSchema,
  DriverUpdated: driverChangedPayloadSchema,
  RouteCreated: routeChangedPayloadSchema,
  RouteUpdated: routeChangedPayloadSchema,
  RouteDeleted: routeDeletedPayloadSchema,
} as const;

export const FLEET_EXAMPLES: Record<keyof typeof FLEET_PAYLOAD_SCHEMAS, unknown> = {
  BusAdded: exampleBus,
  BusUpdated: { ...exampleBus, mileageKm: 148900, version: 2 },
  BusDeactivated: { ...exampleBus, active: false, assignedDriverId: null, version: 3 },
  DriverAdded: exampleDriver,
  DriverUpdated: { ...exampleDriver, licenseExpiresOn: '2028-03-01', version: 2 },
  RouteCreated: exampleRoute,
  RouteUpdated: { ...exampleRoute, ticketPrice: 90, version: 2 },
  RouteDeleted: exampleRouteDeleted,
};
