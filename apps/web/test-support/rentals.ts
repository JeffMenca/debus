import type { Page, Rental } from '@debus/contracts';

export const BRANCH_ID = '9b2c7a10-1111-4c4c-8888-123456789abc';
export const RENTAL_ID = '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c';

export const rental = (over: Partial<Rental> = {}): Rental => ({
  id: RENTAL_ID,
  status: 'CONFIRMED',
  channel: 'ONLINE',
  branchId: BRANCH_ID,
  clientId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  nit: '45218376',
  clientName: 'Ana Méndez',
  email: 'ana.mendez@correo.com',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: '2026-10-24T23:00:00.000Z',
  passengers: 35,
  distanceKm: 92,
  ratePerKm: 30,
  estimatedPrice: 2760,
  price: 2500,
  requestedAt: '2026-10-20T15:00:00.000Z',
  confirmedAt: '2026-10-21T14:00:00.000Z',
  paidOn: null,
  paidAt: null,
  cancelledAt: null,
  ...over,
});

export const rentalPage = (items: Rental[], over: Partial<Page<Rental>> = {}): Page<Rental> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  ...over,
});

type Handler = (init: RequestInit, url: URL) => Response | Promise<Response>;

// Answers the API by "METHOD /api/<service>/<path>" (without the query); anything else fails.
export function mockApi(routes: Record<string, Handler>) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const route = `${init.method ?? 'GET'} ${url.pathname}`;
    const handler = routes[route];
    if (!handler) throw new Error(`unexpected request ${route}`);
    return handler(init, url);
  });
}
