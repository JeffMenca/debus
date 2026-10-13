import { randomUUID } from 'node:crypto';
import {
  type Bus,
  type BusDisplayStatus,
  type BusFields,
  type Driver,
  type DriverFields,
  type Route,
  busFieldsSchema,
  busListQuerySchema,
  createRouteRequestSchema,
  driverFieldsSchema,
  driverListQuerySchema,
  foldSearchText,
  pageArgs,
  routeListQuerySchema,
  toPage,
  todayInGuatemala,
  updateRouteRequestSchema,
} from '@debus/contracts';
import type { Page, Route as PageRoute } from '@playwright/test';
import { CORS_HEADERS, fulfillJson } from './session';
import type { RecordedRequest } from './admin-gateway';

export const FLEET_BRANCH_ID = '9b2c7a10-1111-4c4c-8888-123456789abc';
export const FLEET_BRANCH_NAME = 'Quetzaltenango';

export interface FleetSeed {
  buses?: Bus[];
  drivers?: Driver[];
  routes?: Route[];
  // Branches a route can go to (the own branch is not one of them).
  destinations?: { id: string; name: string }[];
  // Buses and drivers with a scheduled or running trip: the service refuses to deactivate them.
  busyBusIds?: string[];
  busyDriverIds?: string[];
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
const MESSAGES = {
  plateTaken: 'Ya existe un bus con esa placa.',
  busHasTrips:
    'Este bus tiene viajes programados o en camino. Podrás desactivarlo cuando terminen o se eliminen.',
  driverAlreadyAssigned: 'Ese chofer ya está asignado a otro bus.',
  driverUnavailable: 'Elige un chofer activo de tu sucursal.',
  licenseTaken: 'Ya existe un chofer con ese número de licencia.',
  driverEmailTaken: 'Ya existe un chofer con ese correo.',
  driverHasTrips:
    'Este chofer tiene viajes programados o en camino. Podrás desactivarlo cuando terminen o se eliminen.',
  routeTaken: 'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
  routeDestination: 'Elige otra sucursal activa como destino.',
  routeHasTrips: 'Esta ruta ya tiene viajes. Puedes retirarla para que no se programen más.',
  notFound: 'No encontramos lo que buscas.',
  photoInvalid: 'Sube una foto JPG, PNG o WebP de hasta 5 MB.',
  photoMissing: 'Aún no tiene foto.',
} as const;

// A one pixel PNG: what the photo endpoints answer with once a picture was uploaded.
export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const DAY_MS = 86_400_000;
export const dayFromToday = (days: number): string =>
  new Date(Date.parse(`${todayInGuatemala()}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const sorted = <T extends { id: string }>(items: T[], name: (item: T) => string) =>
  [...items].sort((a, b) => name(a).localeCompare(name(b)) || a.id.localeCompare(b.id));

// Plays the flota API with state, like the service: lists are validated, filtered and cut here, the
// counts ignore the selected tab, and the main rules answer with the same status codes and texts.
export async function mockFleetGateway(page: Page, seed: FleetSeed = {}) {
  // The seed is shared by every test of a worker and the handlers change what they hold.
  const {
    buses = [],
    drivers = [],
    routes = [],
    destinations = [],
    busyBusIds = [],
    busyDriverIds = [],
  } = structuredClone(seed);
  const requests: RecordedRequest[] = [];
  const photos = new Set<string>();

  const displayStatus = (bus: Bus): BusDisplayStatus => {
    if (!bus.active) return 'INACTIVE';
    if (bus.displayStatus === 'IN_TRANSIT') return 'IN_TRANSIT';
    return bus.operationalStatus === 'IN_WORKSHOP' ? 'IN_WORKSHOP' : 'AVAILABLE';
  };
  // A bus shows its driver and a driver shows their bus: both are derived from the buses.
  const refreshLinks = () => {
    for (const bus of buses) {
      const driver = drivers.find((item) => item.id === bus.assignedDriverId);
      bus.assignedDriverName = driver?.fullName ?? null;
      bus.displayStatus = displayStatus(bus);
      bus.hasPhoto = photos.has(bus.id);
    }
    for (const driver of drivers) {
      driver.assignedBusPlate =
        buses.find((bus) => bus.assignedDriverId === driver.id)?.plate ?? null;
      driver.hasPhoto = photos.has(driver.id);
    }
  };
  const error = (route: PageRoute, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });
  // What the service refuses with a 409 when a bus is registered or edited (`busId` when editing).
  const busClash = (fields: BusFields, busId?: string): string | null => {
    const others = buses.filter((bus) => bus.id !== busId);
    if (others.some((bus) => bus.plate === fields.plate)) return MESSAGES.plateTaken;
    const driver = drivers.find((item) => item.id === fields.assignedDriverId);
    if (fields.assignedDriverId && !driver?.active) return MESSAGES.driverUnavailable;
    if (driver && others.some((bus) => bus.assignedDriverId === driver.id)) {
      return MESSAGES.driverAlreadyAssigned;
    }
    return null;
  };
  const driverClash = (fields: DriverFields, driverId?: string): string | null => {
    const others = drivers.filter((driver) => driver.id !== driverId);
    if (others.some((driver) => driver.licenseNumber === fields.licenseNumber)) {
      return MESSAGES.licenseTaken;
    }
    if (others.some((driver) => driver.email === fields.email)) return MESSAGES.driverEmailTaken;
    return null;
  };

  async function handlePhoto(
    route: PageRoute,
    method: string,
    holder: { id: string } | undefined,
    // The service refuses what is not an image, and so does the double.
    body: Buffer | null,
  ) {
    if (!holder) return error(route, 404, MESSAGES.notFound);
    if (method === 'PUT') {
      if (!body?.includes('Content-Type: image/')) return error(route, 400, MESSAGES.photoInvalid);
      photos.add(holder.id);
      refreshLinks();
      return fulfillJson(route, 204);
    }
    if (!photos.has(holder.id)) return error(route, 404, MESSAGES.photoMissing);
    return route.fulfill({
      status: 200,
      body: ONE_PIXEL_PNG,
      headers: { ...CORS_HEADERS, 'content-type': 'image/png' },
    });
  }

  await page.route('**/api/flota/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/flota', '');
    const method = request.method();
    const isPhoto = path.endsWith('/photo');
    const body: unknown =
      !isPhoto && request.postData() ? (request.postDataJSON() as unknown) : undefined;
    requests.push({ method, path, query: url.search, body });
    const [, resource, id, action] = path.split('/');
    refreshLinks();

    if (resource === 'buses') {
      if (method === 'GET' && !id) {
        const parsed = busListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const { status, q, ...paging } = parsed.data;
        const matching = buses.filter(
          (bus) => !q || foldSearchText(`${bus.plate} ${bus.brand} ${bus.model}`).includes(q),
        );
        const shown = sorted(
          matching.filter((bus) => status === 'all' || bus.displayStatus === status),
          (bus) => bus.plate,
        );
        const statusCounts = { IN_TRANSIT: 0, AVAILABLE: 0, IN_WORKSHOP: 0, INACTIVE: 0 };
        for (const bus of matching) statusCounts[bus.displayStatus] += 1;
        const { skip, take } = pageArgs(paging);
        return fulfillJson(route, 200, {
          ...toPage(shown.slice(skip, skip + take), shown.length, paging),
          summary: { statusCounts },
        });
      }
      if (method === 'POST' && !id) {
        const parsed = busFieldsSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const clash = busClash(parsed.data);
        if (clash) return error(route, 409, clash);
        const bus: Bus = {
          id: randomUUID(),
          branchId: FLEET_BRANCH_ID,
          ...parsed.data,
          active: true,
          displayStatus: 'AVAILABLE',
          assignedDriverName: null,
          completedTrips: 0,
          hasPhoto: false,
          version: 1,
        };
        buses.push(bus);
        refreshLinks();
        return fulfillJson(route, 201, bus);
      }
      const bus = buses.find((item) => item.id === id);
      if (action === 'photo') return handlePhoto(route, method, bus, request.postDataBuffer());
      if (!bus) return error(route, 404, MESSAGES.notFound);
      if (method === 'GET') return fulfillJson(route, 200, bus);
      if (method === 'PATCH') {
        const parsed = busFieldsSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const clash = busClash(parsed.data, bus.id);
        if (clash) return error(route, 409, clash);
        Object.assign(bus, parsed.data, { version: bus.version + 1 });
        refreshLinks();
        return fulfillJson(route, 200, bus);
      }
      if (method === 'POST' && action === 'deactivate') {
        if (busyBusIds.includes(bus.id)) return error(route, 409, MESSAGES.busHasTrips);
        bus.active = false;
        return fulfillJson(route, 204);
      }
      if (method === 'POST' && action === 'reactivate') {
        bus.active = true;
        return fulfillJson(route, 204);
      }
    }

    if (resource === 'drivers') {
      if (method === 'GET' && !id) {
        const parsed = driverListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const { status, q, expiringWithinDays, ...paging } = parsed.data;
        const limit =
          expiringWithinDays === undefined ? undefined : dayFromToday(expiringWithinDays);
        const matching = drivers.filter(
          (driver) =>
            (!q ||
              foldSearchText(`${driver.fullName} ${driver.licenseNumber} ${driver.email}`).includes(
                q,
              )) &&
            (!limit || driver.licenseExpiresOn <= limit),
        );
        const shown = (
          limit
            ? [...matching].sort((a, b) => a.licenseExpiresOn.localeCompare(b.licenseExpiresOn))
            : sorted(matching, (driver) => driver.fullName)
        ).filter((driver) => status === 'all' || driver.active === (status === 'active'));
        const active = matching.filter((driver) => driver.active).length;
        const { skip, take } = pageArgs(paging);
        return fulfillJson(route, 200, {
          ...toPage(shown.slice(skip, skip + take), shown.length, paging),
          summary: { statusCounts: { active, inactive: matching.length - active } },
        });
      }
      if (method === 'POST' && !id) {
        const parsed = driverFieldsSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const clash = driverClash(parsed.data);
        if (clash) return error(route, 409, clash);
        const driver: Driver = {
          id: randomUUID(),
          branchId: FLEET_BRANCH_ID,
          ...parsed.data,
          active: true,
          assignedBusPlate: null,
          completedTrips: 0,
          hasPhoto: false,
          version: 1,
        };
        drivers.push(driver);
        return fulfillJson(route, 201, driver);
      }
      const driver = drivers.find((item) => item.id === id);
      if (action === 'photo') return handlePhoto(route, method, driver, request.postDataBuffer());
      if (!driver) return error(route, 404, MESSAGES.notFound);
      if (method === 'GET') return fulfillJson(route, 200, driver);
      if (method === 'PATCH') {
        const parsed = driverFieldsSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const clash = driverClash(parsed.data, driver.id);
        if (clash) return error(route, 409, clash);
        Object.assign(driver, parsed.data, { version: driver.version + 1 });
        return fulfillJson(route, 200, driver);
      }
      if (method === 'POST' && action === 'deactivate') {
        if (busyDriverIds.includes(driver.id)) return error(route, 409, MESSAGES.driverHasTrips);
        driver.active = false;
        return fulfillJson(route, 204);
      }
      if (method === 'POST' && action === 'reactivate') {
        driver.active = true;
        return fulfillJson(route, 204);
      }
    }

    if (resource === 'routes') {
      if (method === 'GET' && !id) {
        const parsed = routeListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const { status, q, ...paging } = parsed.data;
        const matching = routes.filter(
          (item) => !q || foldSearchText(item.destinationName).includes(q),
        );
        const shown = sorted(
          matching.filter((item) => status === 'all' || item.active === (status === 'active')),
          (item) => item.destinationName,
        );
        const active = matching.filter((item) => item.active).length;
        const { skip, take } = pageArgs(paging);
        return fulfillJson(route, 200, {
          ...toPage(shown.slice(skip, skip + take), shown.length, paging),
          summary: { statusCounts: { active, inactive: matching.length - active } },
        });
      }
      if (method === 'POST' && !id) {
        const parsed = createRouteRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const destination = destinations.find(
          (item) => item.id === parsed.data.destinationBranchId,
        );
        if (!destination) return error(route, 409, MESSAGES.routeDestination);
        if (routes.some((item) => item.destinationBranchId === destination.id)) {
          return error(route, 409, MESSAGES.routeTaken);
        }
        const created: Route = {
          id: randomUUID(),
          originBranchId: FLEET_BRANCH_ID,
          originName: FLEET_BRANCH_NAME,
          destinationBranchId: destination.id,
          destinationName: destination.name,
          distanceKm: parsed.data.distanceKm,
          ticketPrice: parsed.data.ticketPrice,
          active: true,
          hasTrips: false,
          version: 1,
        };
        routes.push(created);
        return fulfillJson(route, 201, created);
      }
      const found = routes.find((item) => item.id === id);
      if (!found) return error(route, 404, MESSAGES.notFound);
      if (method === 'PATCH') {
        const parsed = updateRouteRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        Object.assign(found, parsed.data, { version: found.version + 1 });
        return fulfillJson(route, 200, found);
      }
      if (method === 'DELETE') {
        if (found.hasTrips) return error(route, 409, MESSAGES.routeHasTrips);
        routes.splice(routes.indexOf(found), 1);
        return fulfillJson(route, 204);
      }
    }

    return error(route, 404, MESSAGES.notFound);
  });

  return { requests, buses, drivers, routes };
}

// Sample data for the screens that need a bus, a driver or a route to start from.
export const sampleBus = (overrides: Partial<Bus> = {}): Bus => ({
  id: randomUUID(),
  branchId: FLEET_BRANCH_ID,
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
  ...overrides,
});

export const sampleDriver = (overrides: Partial<Driver> = {}): Driver => ({
  id: randomUUID(),
  branchId: FLEET_BRANCH_ID,
  fullName: 'Julio Pérez',
  email: 'julio@correo.com',
  phone: '55512345',
  licenseNumber: 'A1234567',
  licenseType: 'C',
  licenseExpiresOn: dayFromToday(400),
  baseSalary: 150,
  active: true,
  assignedBusPlate: null,
  completedTrips: 12,
  hasPhoto: false,
  version: 1,
  ...overrides,
});

export const sampleRoute = (overrides: Partial<Route> = {}): Route => ({
  id: randomUUID(),
  originBranchId: FLEET_BRANCH_ID,
  originName: FLEET_BRANCH_NAME,
  destinationBranchId: randomUUID(),
  destinationName: 'Guatemala',
  distanceKm: 206.5,
  ticketPrice: 85,
  active: true,
  hasTrips: false,
  version: 1,
  ...overrides,
});

const numbered = (index: number) => String(index + 1).padStart(3, '0');
// Plates are one letter, three digits and three letters: C001AAA, C002AAA...
export const manyBuses = (count: number): Bus[] =>
  Array.from({ length: count }, (_, index) =>
    sampleBus({
      id: randomUUID(),
      plate: `C${numbered(index)}AAA`,
      model: `Modelo ${numbered(index)}`,
    }),
  );
