import { randomUUID } from 'node:crypto';
import {
  type Bus,
  type Driver,
  type Route,
  type Trip,
  foldSearchText,
  guatemalaDateTime,
  guatemalaDayRange,
  isLaterInstant,
  pageArgs,
  scheduleTripRequestSchema,
  toPage,
  tripListQuerySchema,
} from '@debus/contracts';
import type { Page, Route as PageRoute } from '@playwright/test';
import type { RecordedRequest } from './admin-gateway';
import { FLEET_BRANCH_ID, dayFromToday } from './fleet-gateway';
import { fulfillJson } from './session';
import { type Reply, type TripCycleSeed, createTripCycle, overlaps } from './trip-cycle-gateway';

// The buses, drivers and routes the screens list come from the flota double; the trips are
// built from them, the way the service builds them from its copies.
export interface TripsFleet {
  buses: Bus[];
  drivers: Driver[];
  routes: Route[];
}

export interface TripsSeed {
  trips?: Trip[];
  // The departures, arrivals and rentals waiting for a bus that the trip screen works with.
  cycle?: TripCycleSeed;
  // The service that answers availability does not respond: scheduling gives a 503.
  fleetDown?: boolean;
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
const MESSAGES = {
  routeNotFound: 'Elige una ruta activa que salga de tu sucursal.',
  routeRetired: 'Esa ruta está retirada. Reactívala o elige otra.',
  departureInPast: 'La salida debe ser en el futuro.',
  busNotFound: 'No encontramos ese bus en tu sucursal.',
  busInactive: 'Ese bus está desactivado.',
  busInWorkshop: 'Ese bus está en taller.',
  busBusy: 'Ese bus ya tiene un viaje en ese horario.',
  driverNotFound: 'No encontramos ese chofer en tu sucursal.',
  driverInactive: 'Ese chofer está desactivado.',
  driverBusy: 'Ese chofer ya tiene un viaje en ese horario.',
  fleetUnavailable:
    'No pudimos revisar si el bus y el chofer están libres. No se guardó nada; intenta de nuevo en unos segundos.',
  notFound: 'No encontramos ese viaje.',
} as const;

// Plays the viajes API with state, like the service: the list is validated, filtered by Guatemalan
// day and cut here, and scheduling answers with the same status codes and texts.
export async function mockTripsGateway(page: Page, fleet: TripsFleet, seed: TripsSeed = {}) {
  const trips = structuredClone(seed.trips ?? []);
  const cycle = createTripCycle(fleet, trips, seed.cycle);
  const requests: RecordedRequest[] = [];
  const error = (route: PageRoute, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });

  await page.route('**/api/viajes/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/viajes', '');
    const method = request.method();
    const body: unknown = request.postData() ? (request.postDataJSON() as unknown) : undefined;
    requests.push({ method, path, query: url.search, body });
    const [, resource, id, step] = path.split('/');
    const answer = (result: Reply) => fulfillJson(route, result.status, result.json);

    if (resource === 'rental-requests') {
      if (method === 'GET' && !id) return answer(cycle.listRentals(url.searchParams));
      if (method === 'POST' && step === 'assignment') return answer(cycle.assignRental(id!, body));
      return error(route, 404, MESSAGES.notFound);
    }
    if (resource !== 'trips') return error(route, 404, MESSAGES.notFound);

    if (method === 'GET' && !id) {
      const parsed = tripListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) return error(route, 400, INVALID);
      const { from, to, status, q, ...paging } = parsed.data;
      const days = guatemalaDayRange(from, to);
      const shown = cycle
        .visibleTrips()
        .filter(
          (trip) =>
            (!days.gte || new Date(trip.departureAt) >= days.gte) &&
            (!days.lt || new Date(trip.departureAt) < days.lt) &&
            (status === 'all' || trip.status === status) &&
            (!q ||
              foldSearchText(
                `${trip.originName} ${trip.destinationName} ${trip.busPlate} ${trip.driverName}`,
              ).includes(q)),
        )
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt) || a.id.localeCompare(b.id));
      const { skip, take } = pageArgs(paging);
      return fulfillJson(route, 200, toPage(shown.slice(skip, skip + take), shown.length, paging));
    }

    if (method === 'GET') return answer(cycle.detail(id!));
    if (method === 'DELETE') return answer(cycle.remove(id!));
    if (method === 'POST' && step === 'departure') return answer(cycle.recordDeparture(id!, body));
    if (method === 'POST' && step === 'arrival') return answer(cycle.recordArrival(id!, body));

    if (method === 'POST' && !id) {
      const parsed = scheduleTripRequestSchema.safeParse(body);
      if (!parsed.success) return error(route, 400, INVALID);
      const input = parsed.data;
      const planned = fleet.routes.find((item) => item.id === input.routeId);
      if (!planned) return error(route, 409, MESSAGES.routeNotFound);
      if (!planned.active) return error(route, 409, MESSAGES.routeRetired);
      if (!isLaterInstant(input.departureAt, new Date().toISOString())) {
        return error(route, 409, MESSAGES.departureInPast);
      }
      const bus = fleet.buses.find((item) => item.id === input.busId);
      if (!bus) return error(route, 409, MESSAGES.busNotFound);
      if (!bus.active) return error(route, 409, MESSAGES.busInactive);
      if (bus.operationalStatus === 'IN_WORKSHOP') return error(route, 409, MESSAGES.busInWorkshop);
      const driver = fleet.drivers.find((item) => item.id === input.driverId);
      if (!driver) return error(route, 409, MESSAGES.driverNotFound);
      if (!driver.active) return error(route, 409, MESSAGES.driverInactive);
      if (seed.fleetDown) return error(route, 503, MESSAGES.fleetUnavailable);
      const live = trips.filter((trip) => trip.status !== 'COMPLETED');
      if (live.some((trip) => trip.busId === bus.id && overlaps(trip, input))) {
        return error(route, 409, MESSAGES.busBusy);
      }
      if (live.some((trip) => trip.driverId === driver.id && overlaps(trip, input))) {
        return error(route, 409, MESSAGES.driverBusy);
      }
      const created: Trip = {
        id: randomUUID(),
        type: 'REGULAR',
        status: 'SCHEDULED',
        branchId: FLEET_BRANCH_ID,
        routeId: planned.id,
        originName: planned.originName,
        destinationName: planned.destinationName,
        busId: bus.id,
        busPlate: bus.plate,
        driverId: driver.id,
        driverName: driver.fullName,
        departureAt: input.departureAt,
        estimatedArrivalAt: input.estimatedArrivalAt,
        ticketPrice: planned.ticketPrice,
        capacity: bus.capacity,
        departedAt: null,
      };
      trips.push(created);
      return fulfillJson(route, 201, created);
    }

    return error(route, 404, MESSAGES.notFound);
  });

  return { requests, trips, rentals: cycle.rentals, records: cycle.records };
}

// A Guatemalan day (counted from today) and hour as the instant the service stores.
export const instantAt = (daysFromToday: number, time: string): string =>
  guatemalaDateTime(dayFromToday(daysFromToday), time);

export const sampleTrip = (overrides: Partial<Trip> = {}): Trip => ({
  id: randomUUID(),
  type: 'REGULAR',
  status: 'SCHEDULED',
  branchId: FLEET_BRANCH_ID,
  routeId: randomUUID(),
  originName: 'Quetzaltenango',
  destinationName: 'Guatemala',
  busId: randomUUID(),
  busPlate: 'C482BTX',
  driverId: randomUUID(),
  driverName: 'Julio Pérez',
  departureAt: instantAt(1, '09:30'),
  estimatedArrivalAt: instantAt(1, '14:30'),
  ticketPrice: 85,
  capacity: 40,
  departedAt: null,
  ...overrides,
});
