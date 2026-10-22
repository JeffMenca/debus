import { randomUUID } from 'node:crypto';
import {
  type Rental,
  confirmRentalRequestSchema,
  counterRentalRequestSchema,
  estimateRentalPrice,
  pageArgs,
  payRentalRequestSchema,
  rentalListQuerySchema,
  rentalRequestSchema,
  toPage,
} from '@debus/contracts';
import type { Page, Route } from '@playwright/test';
import { fulfillJson } from './session';

export const RENTAL_BRANCH_ID = '8f9e6679-7425-40de-944b-e07fc1f90ae7';
const RATE = 30;

export const sampleRental = (over: Partial<Rental> = {}): Rental => ({
  id: randomUUID(),
  status: 'REQUESTED',
  channel: 'ONLINE',
  branchId: RENTAL_BRANCH_ID,
  clientId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  nit: '45218376',
  clientName: 'Ana Méndez',
  email: 'ana.mendez@correo.com',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2030-10-24T13:00:00.000Z',
  returnAt: '2030-10-24T23:00:00.000Z',
  passengers: 35,
  distanceKm: 92,
  ratePerKm: RATE,
  estimatedPrice: 2760,
  price: null,
  requestedAt: '2026-10-20T15:00:00.000Z',
  confirmedAt: null,
  paidOn: null,
  paidAt: null,
  cancelledAt: null,
  ...over,
});

export interface RentalsSeed {
  rentals?: Rental[];
  balance?: number;
  failList?: boolean;
}

const body = (route: Route): unknown => JSON.parse(route.request().postData() ?? '{}');
const params = (route: Route) => Object.fromEntries(new URL(route.request().url()).searchParams);

// Plays the rental routes of clientes (and the cancellation of viajes) with state, the way the
// services answer: online requests, prices, payments from the wallet, cash and cancellations.
export async function mockRentalsGateway(page: Page, seed: RentalsSeed = {}) {
  const rentals = structuredClone(seed.rentals ?? []);
  let balance = seed.balance ?? 3000;
  const find = (id: string) => rentals.find((rental) => rental.id === id);
  const list = (route: Route, keep: (rental: Rental) => boolean) => {
    const query = rentalListQuerySchema.parse(params(route));
    const items = rentals
      .filter(keep)
      .filter((rental) => query.status === 'all' || rental.status === query.status);
    const { skip, take } = pageArgs(query);
    return fulfillJson(route, 200, toPage(items.slice(skip, skip + take), items.length, query));
  };

  await page.route('**/api/administracion/branches/locations?*', (route) =>
    fulfillJson(route, 200, {
      items: [
        {
          id: RENTAL_BRANCH_ID,
          name: 'Xela Centro',
          municipality: 'Quetzaltenango',
          department: 'Quetzaltenango',
          latitude: 14.84,
          longitude: -91.52,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    }),
  );
  await page.route('**/api/clientes/wallet', (route) =>
    fulfillJson(route, 200, { balance, updatedAt: new Date().toISOString() }),
  );

  await page.route(/\/api\/clientes\/(rentals|branch-rentals)(\/[^?]*)?(\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, 204);
    const { pathname } = new URL(route.request().url());
    const [, resource, id, action] =
      pathname.replace('/api/clientes/', '').match(/^([^/]+)\/?([^/]*)\/?([^/]*)$/) ?? [];
    const method = route.request().method();

    if (resource === 'rentals' && id === 'estimate') {
      const km = Number(params(route).distanceKm);
      return fulfillJson(route, 200, {
        ratePerKm: RATE,
        estimatedPrice: estimateRentalPrice(km, RATE),
        effectiveFrom: '2026-10-01',
      });
    }
    if (resource === 'rentals' && id === 'mine') {
      if (seed.failList) return fulfillJson(route, 500, { message: 'falla' });
      return list(route, (rental) => rental.channel === 'ONLINE' || rental.nit === '45218376');
    }
    if (resource === 'branch-rentals' && !id && method === 'GET') {
      if (seed.failList) return fulfillJson(route, 500, { message: 'falla' });
      return list(route, () => true);
    }
    if (resource === 'rentals' && !id && method === 'POST') {
      const trip = rentalRequestSchema.parse(body(route));
      const created = sampleRental({
        ...trip,
        estimatedPrice: estimateRentalPrice(trip.distanceKm, RATE),
      });
      rentals.unshift(created);
      return fulfillJson(route, 201, created);
    }
    if (resource === 'branch-rentals' && !id && method === 'POST') {
      const counter = counterRentalRequestSchema.parse(body(route));
      const created = sampleRental({
        ...counter,
        channel: 'COUNTER',
        clientId: null,
        status: 'CONFIRMED',
        estimatedPrice: estimateRentalPrice(counter.distanceKm, RATE),
        confirmedAt: new Date().toISOString(),
      });
      rentals.unshift(created);
      return fulfillJson(route, 201, created);
    }
    const rental = find(id ?? '');
    if (!rental) return fulfillJson(route, 404, { message: 'No encontramos ese alquiler.' });
    if (action === 'confirm') {
      const request = confirmRentalRequestSchema.parse(body(route));
      Object.assign(rental, {
        status: 'CONFIRMED',
        price: request.price,
        distanceKm: request.distanceKm ?? rental.distanceKm,
        confirmedAt: new Date().toISOString(),
      });
      return fulfillJson(route, 201, rental);
    }
    if (action === 'pay') {
      const { paidOn } = payRentalRequestSchema.parse(body(route));
      if (rental.status !== 'PAID') {
        const price = rental.price ?? 0;
        if (rental.channel === 'ONLINE') {
          if (balance < price) {
            return fulfillJson(route, 422, {
              message: 'No tienes saldo suficiente en tu cartera.',
            });
          }
          balance -= price;
        }
        Object.assign(rental, { status: 'PAID', paidOn, paidAt: new Date().toISOString() });
      }
      return fulfillJson(route, 201, rental);
    }
    if (action === 'cancel') {
      Object.assign(rental, { status: 'CANCELLED', cancelledAt: new Date().toISOString() });
      return fulfillJson(route, 201, rental);
    }
    return fulfillJson(route, 404, { message: 'ruta no simulada' });
  });

  await page.route('**/api/viajes/rental-requests/*/cancel', (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, 204);
    const id = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
    const rental = find(id);
    if (!rental) return fulfillJson(route, 404, { message: 'No encontramos ese alquiler.' });
    rental.status = 'CANCELLED';
    if (rental.channel === 'ONLINE') balance += rental.price ?? 0;
    return fulfillJson(route, 201, {
      ...rental,
      price: rental.price ?? 0,
      status: 'CANCELLED',
      tripId: null,
    });
  });

  return { rentals: () => rentals, balance: () => balance };
}
