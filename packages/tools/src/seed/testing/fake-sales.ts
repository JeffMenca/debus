import { guatemalaDayRange } from '@debus/contracts';
import { GatewayError, type Session } from '../gateway-client';
import type { FakeGateway } from './fake-gateway';
import {
  NO_ROUTE,
  conflict,
  keyOf,
  notFound,
  paged,
  unprocessable,
  type Body,
  type FakeExtension,
  type FakeRequest,
  type Row,
} from './fake-support';

const ACCOUNT_NOT_READY =
  'Estamos terminando de preparar tu cuenta. Intenta de nuevo en unos segundos.';
const KEY_REUSED = 'Esta clave ya se usó con otros datos. Recarga la página e intenta de nuevo.';
const SEAT_TAKEN = 'Alguien más tomó uno de esos asientos. Elige otros.';
const NOT_ENOUGH = 'No tienes saldo suficiente en tu cartera. Tus asientos quedaron libres.';
const IN_DOUBT = 'Estamos confirmando el pago con tu cartera. No repitas la compra.';
const OTHER_BRANCH = 'Solo puedes vender viajes que salen de tu sucursal.';
const CONSUMER = 'CF';

interface Purchase {
  ticketId: string;
  clientId: string;
  tripId: string;
  seats: number[];
  amount: number;
  paidOn: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  failure: string | null;
  // Reads left before a purchase in doubt settles.
  readsLeft: number;
}

const sorted = (seats: number[]): string => [...seats].sort((a, b) => a - b).join(',');

// Trips on sale, online purchases with the wallet and cash sales at the counter, with the rules
// the seed can break: a seat is sold once, a key gives one result, and a sale needs its money.
export class FakeSales implements FakeExtension {
  // Every ticket sold, by either channel.
  readonly tickets: Row[] = [];
  private readonly purchases = new Map<string, Purchase>();
  private readonly seats = new Map<string, Map<number, string>>();
  private nextPendingReads: number | null = null;

  constructor(private readonly gateway: FakeGateway) {}

  route(request: FakeRequest): unknown {
    const { session, method, url, body } = request;
    const key = `${method} ${url.pathname}`;
    if (key === 'GET /api/ventas/trips') return this.listTrips(url);
    if (key === 'POST /api/ventas/purchases') return this.buy(request);
    if (key === 'GET /api/ventas/tickets') return this.history(session, url);
    if (key === 'POST /api/ventas/counter/tickets') return this.sellAtCounter(request, body);
    const purchase = /^GET \/api\/ventas\/purchases\/([^/]+)$/.exec(key);
    if (purchase?.[1]) return this.readPurchase(session, purchase[1]);
    return NO_ROUTE;
  }

  // The next purchase stays in doubt until it has been read this many times.
  leaveNextPending(reads: number): void {
    this.nextPendingReads = reads;
  }

  // Somebody else sells these seats.
  occupy(tripId: string, seats: number[]): void {
    for (const seat of seats) this.seatsOf(tripId).set(seat, 'someone-else');
  }

  private seatsOf(tripId: string): Map<number, string> {
    const known = this.seats.get(tripId);
    if (known) return known;
    const created = new Map<number, string>();
    this.seats.set(tripId, created);
    return created;
  }

  private trip(tripId: string): Row {
    const trip = this.gateway.trips.find(
      (candidate) =>
        candidate.id === tripId &&
        candidate.type === 'REGULAR' &&
        candidate.status === 'SCHEDULED' &&
        Date.parse(candidate.departureAt as string) > this.gateway.now().getTime(),
    );
    if (!trip) throw notFound('No encontramos ese viaje.');
    return trip;
  }

  private listTrips(url: URL) {
    const range = guatemalaDayRange(
      url.searchParams.get('from') ?? undefined,
      url.searchParams.get('to') ?? undefined,
    );
    const now = this.gateway.now().getTime();
    const items = this.gateway.trips
      .filter((trip) => trip.type === 'REGULAR' && trip.status === 'SCHEDULED')
      .filter((trip) => {
        const at = Date.parse(trip.departureAt as string);
        return (
          at > now &&
          (!range.gte || at >= range.gte.getTime()) &&
          (!range.lt || at < range.lt.getTime())
        );
      })
      .sort((a, b) => String(a.departureAt).localeCompare(String(b.departureAt)))
      .map((trip) => ({
        tripId: trip.id,
        routeId: trip.routeId,
        branchId: trip.branchId,
        originLabel: trip.originName,
        destinationLabel: trip.destinationName,
        departureAt: trip.departureAt,
        estimatedArrivalAt: trip.estimatedArrivalAt,
        ticketPrice: trip.ticketPrice,
        busPlate: trip.busPlate,
        capacity: trip.capacity,
        freeSeats: (trip.capacity as number) - this.seatsOf(trip.id).size,
      }));
    return paged(items, url.searchParams);
  }

  private take(tripId: string, seats: number[], ticketId: string): void {
    const taken = this.seatsOf(tripId);
    if (seats.some((seat) => taken.has(seat))) throw conflict(SEAT_TAKEN);
    for (const seat of seats) taken.set(seat, ticketId);
  }

  private release(tripId: string, ticketId: string): void {
    const taken = this.seatsOf(tripId);
    for (const [seat, holder] of taken) if (holder === ticketId) taken.delete(seat);
  }

  private ticketRow(
    id: string,
    trip: Row,
    detail: {
      channel: 'ONLINE' | 'COUNTER';
      seats: number[];
      paidOn: string;
      nit: string;
      buyerName: string;
      clientId: string | null;
    },
  ): Row {
    const unitPrice = trip.ticketPrice as number;
    return {
      id,
      status: 'CONFIRMED',
      channel: detail.channel,
      tripId: trip.id,
      originLabel: trip.originName,
      destinationLabel: trip.destinationName,
      departureAt: trip.departureAt,
      busPlate: trip.busPlate,
      seats: [...detail.seats].sort((a, b) => a - b),
      unitPrice,
      total: Math.round(unitPrice * detail.seats.length * 100) / 100,
      nit: detail.nit,
      buyerName: detail.buyerName,
      paidOn: detail.paidOn,
      soldAt: this.gateway.now().toISOString(),
      branchId: trip.branchId,
      clientId: detail.clientId,
    };
  }

  private buy(request: FakeRequest) {
    const { session, body } = request;
    if (!session) throw new Error('This route needs a session');
    const ticketId = keyOf(request);
    const { tripId, seats, paidOn } = body as { tripId: string; seats: number[]; paidOn: string };
    const existing = this.purchases.get(ticketId);
    if (existing) {
      if (
        existing.clientId !== session.user.id ||
        existing.tripId !== tripId ||
        sorted(existing.seats) !== sorted(seats)
      ) {
        throw conflict(KEY_REUSED);
      }
      if (existing.status === 'FAILED') throw unprocessable(NOT_ENOUGH);
      return this.settle(existing);
    }
    const profile = this.gateway.clients.profileOf(session.user.id);
    if (!profile) throw conflict(ACCOUNT_NOT_READY);
    const trip = this.trip(tripId);
    this.take(tripId, seats, ticketId);
    const purchase: Purchase = {
      ticketId,
      clientId: session.user.id,
      tripId,
      seats,
      amount: Math.round((trip.ticketPrice as number) * seats.length * 100) / 100,
      paidOn,
      status: 'PENDING',
      failure: null,
      readsLeft: this.nextPendingReads ?? 0,
    };
    this.purchases.set(ticketId, purchase);
    if (this.nextPendingReads === null) return this.charge(purchase, profile);
    this.nextPendingReads = null;
    return this.view(purchase);
  }

  // The wallet answers: the ticket exists, or the seats go back and the purchase is a failure.
  private charge(purchase: Purchase, profile = this.gateway.clients.profileOf(purchase.clientId)) {
    const trip = this.gateway.trips.find((candidate) => candidate.id === purchase.tripId);
    try {
      this.gateway.clients.debit(purchase.clientId, {
        kind: 'TICKET',
        amount: purchase.amount,
        reference: purchase.ticketId,
        description: `Boleto ${String(trip?.originName)} a ${String(trip?.destinationName)}`,
        occurredOn: purchase.paidOn,
      });
    } catch (error) {
      if (!(error instanceof GatewayError) || error.status !== 422) throw error;
      this.release(purchase.tripId, purchase.ticketId);
      purchase.status = 'FAILED';
      purchase.failure = 'INSUFFICIENT_BALANCE';
      throw unprocessable(NOT_ENOUGH);
    }
    purchase.status = 'CONFIRMED';
    this.tickets.push(
      this.ticketRow(purchase.ticketId, trip as Row, {
        channel: 'ONLINE',
        seats: purchase.seats,
        paidOn: purchase.paidOn,
        nit: (profile?.nit as string | null) ?? CONSUMER,
        buyerName: String(profile?.fullName),
        clientId: purchase.clientId,
      }),
    );
    return this.view(purchase);
  }

  private settle(purchase: Purchase) {
    if (purchase.status === 'PENDING') {
      if (purchase.readsLeft > 0) purchase.readsLeft -= 1;
      if (purchase.readsLeft === 0) return this.charge(purchase);
    }
    return this.view(purchase);
  }

  private view(purchase: Purchase) {
    const ticket = this.tickets.find((candidate) => candidate.id === purchase.ticketId) ?? null;
    return {
      ticketId: purchase.ticketId,
      tripId: purchase.tripId,
      status: purchase.status,
      seats: purchase.seats,
      amount: purchase.amount,
      paidOn: purchase.paidOn,
      failure: purchase.failure,
      message:
        purchase.status === 'PENDING' ? IN_DOUBT : purchase.status === 'FAILED' ? NOT_ENOUGH : null,
      ticket: purchase.status === 'CONFIRMED' ? ticket : null,
    };
  }

  private readPurchase(session: Session | null, ticketId: string) {
    const purchase = this.purchases.get(ticketId);
    if (!purchase || purchase.clientId !== session?.user.id) {
      throw notFound('No encontramos esa compra.');
    }
    return this.settle(purchase);
  }

  private sellAtCounter(request: FakeRequest, body: Body) {
    const { session } = request;
    const branchId = session?.user.branchId;
    if (!branchId) throw new GatewayError(403, 'Tu rol no permite esta acción.');
    const id = keyOf(request);
    const { tripId, seats, paidOn } = body as { tripId: string; seats: number[]; paidOn: string };
    const existing = this.tickets.find((ticket) => ticket.id === id);
    if (existing) {
      const same =
        existing.channel === 'COUNTER' &&
        existing.tripId === tripId &&
        existing.branchId === branchId &&
        sorted(existing.seats as number[]) === sorted(seats);
      if (!same) throw conflict(KEY_REUSED);
      return existing;
    }
    const trip = this.trip(tripId);
    if (trip.branchId !== branchId) throw new GatewayError(403, OTHER_BRANCH);
    this.take(tripId, seats, id);
    const nit = String(body.nit ?? CONSUMER);
    const owner =
      nit === CONSUMER
        ? undefined
        : this.gateway.users
            .filter((user) => user.role === 'CLIENT')
            .find((user) => this.gateway.clients.profileOf(user.id)?.nit === nit);
    const ticket = this.ticketRow(id, trip, {
      channel: 'COUNTER',
      seats,
      paidOn,
      nit,
      buyerName: String(body.buyerName ?? owner?.fullName ?? 'Consumidor final'),
      clientId: owner?.id ?? null,
    });
    this.tickets.push(ticket);
    return ticket;
  }

  private history(session: Session | null, url: URL) {
    const items = this.tickets
      .filter((ticket) => ticket.clientId === session?.user.id)
      .sort((a, b) => String(a.departureAt).localeCompare(String(b.departureAt)));
    const next =
      items.find(
        (ticket) => Date.parse(ticket.departureAt as string) > this.gateway.now().getTime(),
      ) ?? null;
    return { ...paged(items, url.searchParams), summary: { next } };
  }
}
