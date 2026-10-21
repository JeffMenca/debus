import { randomUUID } from 'node:crypto';
import {
  type AvailableTrip,
  type Purchase,
  type Ticket,
  availableTripListQuerySchema,
  guatemalaDayRange,
  pageArgs,
  purchaseTicketRequestSchema,
  ticketListQuerySchema,
  toPage,
} from '@debus/contracts';
import type { Page, Route } from '@playwright/test';
import { fulfillJson } from './session';

// The same texts the ventas service answers with.
export const SALE_MESSAGES = {
  seatTaken: 'Alguno de los asientos que elegiste ya fue vendido. Elige otros.',
  insufficientBalance:
    'No tienes saldo suficiente en tu cartera. Recarga y vuelve a intentarlo; tus asientos quedaron libres.',
  walletUnavailable:
    'No pudimos conectar con tu cartera. No se te cobró nada y tus asientos quedaron libres; intenta de nuevo en unos segundos.',
  paymentPending:
    'Estamos confirmando el pago con tu cartera. Tus asientos están apartados; no repitas la compra.',
  tripNotFound: 'No encontramos ese viaje. Puede que ya no esté a la venta.',
  invalid: 'Revisa los datos marcados e intenta de nuevo.',
} as const;

// How the next purchase ends: confirmed at once, confirmed after a 202, short of balance or
// with the wallet down.
export type PurchaseEnding = 'confirmed' | 'pending' | 'insufficient' | 'unavailable';

const PATH =
  /\/api\/ventas\/(trips|trips\/places|trips\/([^/]+)\/seats|purchases|purchases\/([^/]+)|tickets)(\?|$)/;

// Plays the client routes of the ventas API with state: a purchase takes its seats once per
// Idempotency-Key, a taken seat answers 409 and a confirmed one shows up in the history.
export async function mockClientTripsGateway(
  page: Page,
  trips: AvailableTrip[],
  history: Ticket[] = [],
) {
  const taken = new Map<string, number[]>(trips.map((trip) => [trip.tripId, []]));
  const purchases = new Map<string, Purchase>();
  const tickets = [...history];
  const endings: PurchaseEnding[] = [];
  const error = (route: Route, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });
  const withSeats = (trip: AvailableTrip): AvailableTrip => ({
    ...trip,
    freeSeats: trip.capacity - (taken.get(trip.tripId)?.length ?? 0),
  });

  function confirm(purchase: Purchase): Purchase {
    const trip = trips.find((item) => item.tripId === purchase.tripId)!;
    const ticket: Ticket = {
      id: purchase.ticketId,
      status: 'CONFIRMED',
      channel: 'ONLINE',
      tripId: trip.tripId,
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
      departureAt: trip.departureAt,
      busPlate: trip.busPlate,
      seats: purchase.seats,
      unitPrice: trip.ticketPrice,
      total: purchase.amount,
      nit: 'CF',
      buyerName: 'Ana Méndez',
      paidOn: purchase.paidOn,
      soldAt: new Date().toISOString(),
    };
    tickets.unshift(ticket);
    const confirmed: Purchase = { ...purchase, status: 'CONFIRMED', message: null, ticket };
    purchases.set(purchase.ticketId, confirmed);
    return confirmed;
  }

  await page.route(PATH, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);
    const url = new URL(request.url());
    const [, resource, seatsOf, purchaseId] = url.pathname.match(PATH) ?? [];

    if (resource === 'trips/places') {
      return fulfillJson(route, 200, {
        origins: [...new Set(trips.map((trip) => trip.originLabel))].sort(),
        destinations: [...new Set(trips.map((trip) => trip.destinationLabel))].sort(),
      });
    }
    if (resource === 'trips') {
      const query = availableTripListQuerySchema.parse(Object.fromEntries(url.searchParams));
      const { gte, lt } = guatemalaDayRange(query.from, query.to);
      const found = trips
        .map(withSeats)
        .filter(
          (trip) =>
            (!gte || Date.parse(trip.departureAt) >= gte.getTime()) &&
            (!lt || Date.parse(trip.departureAt) < lt.getTime()) &&
            (!query.origin || trip.originLabel === query.origin) &&
            (!query.destination || trip.destinationLabel === query.destination) &&
            (!query.seats || trip.freeSeats >= query.seats),
        );
      const { skip, take } = pageArgs(query);
      return fulfillJson(route, 200, toPage(found.slice(skip, skip + take), found.length, query));
    }
    if (seatsOf) {
      const trip = trips.find((item) => item.tripId === seatsOf);
      if (!trip) return error(route, 404, SALE_MESSAGES.tripNotFound);
      return fulfillJson(route, 200, { ...trip, taken: [...(taken.get(trip.tripId) ?? [])] });
    }
    if (resource === 'tickets') {
      const query = ticketListQuerySchema.parse(Object.fromEntries(url.searchParams));
      const { skip, take } = pageArgs(query);
      const next =
        [...tickets]
          .filter((ticket) => Date.parse(ticket.departureAt) > Date.now())
          .sort((a, b) => Date.parse(a.departureAt) - Date.parse(b.departureAt))[0] ?? null;
      return fulfillJson(route, 200, {
        ...toPage(tickets.slice(skip, skip + take), tickets.length, query),
        summary: { next },
      });
    }
    if (purchaseId) {
      const pending = purchases.get(purchaseId);
      if (!pending) return error(route, 404, 'No encontramos esa compra.');
      return fulfillJson(route, 200, pending.status === 'PENDING' ? confirm(pending) : pending);
    }

    const key = request.headers()['idempotency-key'];
    const parsed = purchaseTicketRequestSchema.safeParse(request.postDataJSON());
    if (!key || !parsed.success) return error(route, 400, SALE_MESSAGES.invalid);
    const previous = purchases.get(key);
    if (previous) return fulfillJson(route, previous.status === 'CONFIRMED' ? 201 : 202, previous);
    const trip = trips.find((item) => item.tripId === parsed.data.tripId)!;
    const occupied = taken.get(trip.tripId)!;
    if (parsed.data.seats.some((seat) => occupied.includes(seat))) {
      return error(route, 409, SALE_MESSAGES.seatTaken);
    }
    const ending = endings.shift() ?? 'confirmed';
    if (ending === 'insufficient') return error(route, 422, SALE_MESSAGES.insufficientBalance);
    if (ending === 'unavailable') return error(route, 503, SALE_MESSAGES.walletUnavailable);
    occupied.push(...parsed.data.seats);
    const purchase: Purchase = {
      ticketId: key,
      tripId: trip.tripId,
      status: 'PENDING',
      seats: [...parsed.data.seats].sort((a, b) => a - b),
      amount: trip.ticketPrice * parsed.data.seats.length,
      paidOn: parsed.data.paidOn,
      failure: null,
      message: SALE_MESSAGES.paymentPending,
      ticket: null,
    };
    purchases.set(key, purchase);
    if (ending === 'pending') return fulfillJson(route, 202, purchase);
    return fulfillJson(route, 201, confirm(purchase));
  });

  return {
    // Someone else buys the seat in the meantime.
    takeSeat: (tripId: string, seat: number) => taken.get(tripId)!.push(seat),
    endNextPurchase: (ending: PurchaseEnding) => endings.push(ending),
    purchases: () => [...purchases.values()],
  };
}

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export const sampleClientTrip = (over: Partial<AvailableTrip> = {}): AvailableTrip => ({
  tripId: randomUUID(),
  routeId: randomUUID(),
  branchId: randomUUID(),
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Ciudad de Guatemala',
  departureAt: hoursFromNow(3),
  estimatedArrivalAt: hoursFromNow(7),
  ticketPrice: 85,
  busPlate: 'C482BTX',
  capacity: 40,
  freeSeats: 40,
  ...over,
});
