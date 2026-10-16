import { randomUUID } from 'node:crypto';
import {
  type AvailableTrip,
  type Ticket,
  availableTripListQuerySchema,
  counterSaleRequestSchema,
  pageArgs,
  toPage,
} from '@debus/contracts';
import type { Page, Route } from '@playwright/test';
import { FLEET_BRANCH_ID } from './fleet-gateway';
import { fulfillJson } from './session';

// The same texts the ventas service answers with.
export const COUNTER_MESSAGES = {
  seatTaken: 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
  invalid: 'Revisa los datos marcados e intenta de nuevo.',
} as const;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export const sampleTripOnSale = (over: Partial<AvailableTrip> = {}): AvailableTrip => ({
  tripId: randomUUID(),
  routeId: randomUUID(),
  branchId: FLEET_BRANCH_ID,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: hoursFromNow(3),
  estimatedArrivalAt: hoursFromNow(7),
  ticketPrice: 85,
  busPlate: 'C482BTX',
  capacity: 40,
  freeSeats: 40,
  ...over,
});

const PATH = /\/api\/ventas\/(counter\/trips|counter\/tickets|trips\/([^/]+)\/seats)(\?|$)/;

// Plays the counter routes of the ventas API with state: a sale takes its seats once per
// Idempotency-Key and a seat can be taken only once, like the primary key of the service.
export async function mockCounterGateway(page: Page, trips: AvailableTrip[]) {
  const taken = new Map<string, number[]>(trips.map((trip) => [trip.tripId, []]));
  const sales = new Map<string, Ticket>();
  let loseNextAnswer = false;
  const error = (route: Route, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });
  const withSeats = (trip: AvailableTrip): AvailableTrip => ({
    ...trip,
    freeSeats: trip.capacity - (taken.get(trip.tripId)?.length ?? 0),
  });

  await page.route(PATH, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);
    const url = new URL(request.url());
    const [, resource, seatsOf] = url.pathname.match(PATH) ?? [];

    if (resource === 'counter/trips') {
      const query = availableTripListQuerySchema.parse(Object.fromEntries(url.searchParams));
      const found = trips.filter(
        (trip) =>
          !query.q || `${trip.destinationLabel} ${trip.busPlate}`.toLowerCase().includes(query.q),
      );
      const { skip, take } = pageArgs(query);
      return fulfillJson(
        route,
        200,
        toPage(found.slice(skip, skip + take).map(withSeats), found.length, query),
      );
    }
    if (seatsOf) {
      const trip = trips.find((item) => item.tripId === seatsOf);
      if (!trip) return error(route, 404, 'No encontramos ese viaje.');
      return fulfillJson(route, 200, { ...trip, taken: [...(taken.get(trip.tripId) ?? [])] });
    }
    const key = request.headers()['idempotency-key'];
    const parsed = counterSaleRequestSchema.safeParse(request.postDataJSON());
    if (!key || !parsed.success) return error(route, 400, COUNTER_MESSAGES.invalid);
    const previous = sales.get(key);
    if (previous) return fulfillJson(route, 201, previous);
    const trip = trips.find((item) => item.tripId === parsed.data.tripId)!;
    const occupied = taken.get(trip.tripId)!;
    if (parsed.data.seats.some((seat) => occupied.includes(seat))) {
      return error(route, 409, COUNTER_MESSAGES.seatTaken);
    }
    occupied.push(...parsed.data.seats);
    const seats = [...parsed.data.seats].sort((a, b) => a - b);
    const ticket: Ticket = {
      id: key,
      status: 'CONFIRMED',
      channel: 'COUNTER',
      tripId: trip.tripId,
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
      departureAt: trip.departureAt,
      busPlate: trip.busPlate,
      seats,
      unitPrice: trip.ticketPrice,
      total: trip.ticketPrice * seats.length,
      nit: parsed.data.nit,
      buyerName: parsed.data.buyerName ?? 'Consumidor final',
      paidOn: parsed.data.paidOn,
      soldAt: new Date().toISOString(),
    };
    sales.set(key, ticket);
    if (loseNextAnswer) {
      loseNextAnswer = false;
      return route.abort('connectionreset');
    }
    return fulfillJson(route, 201, ticket);
  });

  return {
    // Someone else, at another counter or online, buys the seat.
    takeSeat: (tripId: string, seat: number) => taken.get(tripId)!.push(seat),
    sales: () => [...sales.values()],
    // The next sale is stored but its answer never reaches the browser.
    loseNextAnswer: () => {
      loseNextAnswer = true;
    },
  };
}
