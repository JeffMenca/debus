import type { AvailableTrip, Page, Purchase, SeatMap, Ticket, TicketPage } from '@debus/contracts';

export const TRIP_ID = '5b4a3f2e-1d0c-4b9a-8f7e-6d5c4b3a2f1e';
export const TICKET_ID = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';

export const availableTrip = (over: Partial<AvailableTrip> = {}): AvailableTrip => ({
  tripId: TRIP_ID,
  routeId: '3b2c1d0e-6f5a-4b4c-9d8e-7f6a5b4c3d2e',
  branchId: '9b2c7a10-1111-4c4c-8888-123456789abc',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: '2026-10-20T11:30:00.000Z',
  estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
  ticketPrice: 85,
  busPlate: 'C482BTX',
  capacity: 40,
  freeSeats: 37,
  ...over,
});

export const availableTripPage = (
  items: AvailableTrip[],
  over: Partial<Page<AvailableTrip>> = {},
): Page<AvailableTrip> => ({ items, total: items.length, page: 1, pageSize: 20, ...over });

export const seatMap = (over: Partial<SeatMap> = {}): SeatMap => ({
  tripId: TRIP_ID,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  busPlate: 'C482BTX',
  capacity: 12,
  ticketPrice: 85,
  departureAt: '2026-10-20T11:30:00.000Z',
  estimatedArrivalAt: '2026-10-20T15:45:00.000Z',
  taken: [1, 2],
  ...over,
});

export const soldTicket = (over: Partial<Ticket> = {}): Ticket => ({
  id: TICKET_ID,
  status: 'CONFIRMED',
  channel: 'COUNTER',
  tripId: TRIP_ID,
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Guatemala',
  departureAt: '2026-10-20T11:30:00.000Z',
  busPlate: 'C482BTX',
  seats: [9, 10],
  unitPrice: 85,
  total: 170,
  nit: 'CF',
  buyerName: 'Consumidor final',
  paidOn: '2026-10-18',
  soldAt: '2026-10-18T15:30:00.000Z',
  ...over,
});

// A purchase with the wallet as the server answers it; confirmed carries its ticket.
export function purchase(status: Purchase['status'] = 'CONFIRMED', over: Partial<Purchase> = {}) {
  const settled: Partial<Purchase> =
    status === 'CONFIRMED'
      ? { failure: null, message: null, ticket: soldTicket({ channel: 'ONLINE' }) }
      : status === 'PENDING'
        ? { failure: null, message: 'Estamos confirmando el pago…', ticket: null }
        : { failure: 'INSUFFICIENT_BALANCE', message: 'No tienes saldo suficiente.', ticket: null };
  return {
    ticketId: TICKET_ID,
    tripId: TRIP_ID,
    status,
    seats: [9, 10],
    amount: 170,
    paidOn: '2026-10-20',
    ...settled,
    ...over,
  } as Purchase;
}

export const ticketPage = (
  items: Ticket[],
  next: Ticket | null = null,
  over: Partial<Page<Ticket>> = {},
): TicketPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  summary: { next },
  ...over,
});

type Handler = (init: RequestInit) => Response | Promise<Response>;

// Answers the gateway by "METHOD /path" (the path after /api, without the query); anything else fails.
export function mockGatewayApi(routes: Record<string, Handler>) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const route = `${init.method ?? 'GET'} ${url.pathname.replace('/api', '')}`;
    const handler = routes[route];
    if (!handler) throw new Error(`unexpected request ${route}`);
    return handler(init);
  });
}

// The same for the ventas API alone, with the path after /api/ventas.
export const mockVentasApi = (routes: Record<string, Handler>) =>
  mockGatewayApi(
    Object.fromEntries(
      Object.entries(routes).map(([route, handler]) => [route.replace(' ', ' /ventas'), handler]),
    ),
  );
