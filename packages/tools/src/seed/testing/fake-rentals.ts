import { estimateRentalPrice, foldSearchText } from '@debus/contracts';
import { GatewayError, type Session } from '../gateway-client';
import { ACCOUNT_PENDING } from './fake-clients';
import type { FakeGateway } from './fake-gateway';
import {
  NO_ROUTE,
  badRequest,
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

const RATE_PER_KM = 12;
const CONSUMER = 'CF';
const NOT_FOUND = 'No encontramos ese alquiler.';
const DEPARTURE_PASSED = 'La salida de este alquiler ya pasó.';
const KEY_REUSED =
  'Esta operación ya se hizo con otros datos. Recarga la página e intenta de nuevo.';

type Status = 'REQUESTED' | 'CONFIRMED' | 'PAID' | 'CANCELLED';
type RequestStatus = 'PENDING' | 'ASSIGNED' | 'CANCELLED';

interface RentalRequest {
  status: RequestStatus;
  tripId: string | null;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

// Rentals of buses in `clientes` and the requests of paid ones in `viajes`, with the rules the
// seed can break: the order of the steps, one payment per rental, a bus that is free and big enough.
export class FakeRentals implements FakeExtension {
  private readonly rentals = new Map<string, Row & { status: Status }>();
  private readonly requests = new Map<string, RentalRequest>();

  constructor(private readonly gateway: FakeGateway) {}

  route(request: FakeRequest): unknown {
    const { session, method, url, body } = request;
    const key = `${method} ${url.pathname}`;
    if (key === 'GET /api/clientes/rentals/estimate') return this.estimate(url);
    if (key === 'POST /api/clientes/rentals') return this.request(session, body);
    if (key === 'GET /api/clientes/rentals/mine') return this.mine(session, url);
    if (key === 'GET /api/clientes/branch-rentals') return this.ofBranch(session, url);
    if (key === 'POST /api/clientes/branch-rentals') return this.register(session, body);
    if (key === 'GET /api/viajes/rental-requests') return this.listRequests(session, url);
    const route = /^POST \/api\/(clientes|viajes)\/([a-z-]+)\/([^/]+)\/([a-z]+)$/.exec(key);
    if (!route) return NO_ROUTE;
    const [, , collection, id, action] = route;
    if (!id) return NO_ROUTE;
    if (collection === 'branch-rentals' && action === 'confirm')
      return this.confirm(session, id, body);
    if (collection === 'rentals' && action === 'pay') return this.pay(request, id);
    if (collection === 'rentals' && action === 'cancel') return this.cancel(session, id);
    if (collection === 'rental-requests' && action === 'assignment')
      return this.assign(session, id, body);
    if (collection === 'rental-requests' && action === 'cancel')
      return this.cancelPaid(session, id);
    return NO_ROUTE;
  }

  // Every rental, in the order it was asked for.
  all(): Row[] {
    return [...this.rentals.values()];
  }

  requestStatus(id: string): RequestStatus | undefined {
    return this.requests.get(id)?.status;
  }

  private branchOf(session: Session | null): string {
    const branchId = session?.user.branchId;
    if (!branchId) throw new GatewayError(403, 'Tu rol no permite esta acción.');
    return branchId;
  }

  private find(id: string): Row & { status: Status } {
    const rental = this.rentals.get(id);
    if (!rental) throw notFound(NOT_FOUND);
    return rental;
  }

  private ofMyBranch(session: Session | null, id: string): Row & { status: Status } {
    const rental = this.find(id);
    if (rental.branchId !== this.branchOf(session)) throw notFound(NOT_FOUND);
    return rental;
  }

  private departed(rental: Row): boolean {
    return Date.parse(rental.departureAt as string) <= this.gateway.now().getTime();
  }

  private estimate(url: URL) {
    const distanceKm = Number(url.searchParams.get('distanceKm'));
    return {
      ratePerKm: RATE_PER_KM,
      estimatedPrice: estimateRentalPrice(distanceKm, RATE_PER_KM),
      effectiveFrom: '2026-01-01',
    };
  }

  private create(body: Body, party: Record<string, unknown>): Row & { status: Status } {
    const rental = {
      id: this.gateway.nextId(),
      branchId: body.branchId,
      originLabel: body.originLabel,
      destinationLabel: body.destinationLabel,
      departureAt: body.departureAt,
      returnAt: body.returnAt ?? null,
      passengers: body.passengers,
      distanceKm: body.distanceKm,
      ratePerKm: RATE_PER_KM,
      estimatedPrice: estimateRentalPrice(body.distanceKm as number, RATE_PER_KM),
      price: null,
      requestedAt: this.gateway.now().toISOString(),
      confirmedAt: null,
      paidOn: null,
      paidAt: null,
      cancelledAt: null,
      email: null,
      ...party,
    } as unknown as Row & { status: Status };
    this.rentals.set(rental.id, rental);
    return rental;
  }

  private request(session: Session | null, body: Body) {
    const userId = session?.user.id ?? '';
    const profile = this.gateway.clients.profileOf(userId);
    if (!profile) throw notFound(ACCOUNT_PENDING);
    const branch = this.gateway.branches.find((candidate) => candidate.id === body.branchId);
    if (!branch?.active) throw unprocessable('Esa sucursal no está disponible.');
    return this.create(body, {
      status: 'REQUESTED',
      channel: 'ONLINE',
      clientId: userId,
      nit: (profile.nit as string | null) ?? CONSUMER,
      clientName: profile.fullName,
      email: profile.email,
    });
  }

  private register(session: Session | null, body: Body) {
    if (body.branchId !== this.branchOf(session)) {
      throw new GatewayError(403, 'Solo puedes registrar alquileres de tu sucursal.');
    }
    return this.create(body, {
      status: 'CONFIRMED',
      channel: 'COUNTER',
      clientId: null,
      nit: body.nit,
      clientName: body.clientName,
      email: body.email ?? null,
      price: body.price,
      confirmedAt: this.gateway.now().toISOString(),
    });
  }

  private matches(rental: Row, url: URL): boolean {
    const status = url.searchParams.get('status') ?? 'all';
    const term = foldSearchText(url.searchParams.get('q') ?? '');
    const text = foldSearchText(
      [rental.clientName, rental.nit, rental.originLabel, rental.destinationLabel].join(' '),
    );
    return (status === 'all' || rental.status === status) && text.includes(term);
  }

  private mine(session: Session | null, url: URL) {
    const nit = this.gateway.clients.profileOf(session?.user.id ?? '')?.nit;
    const items = [...this.rentals.values()]
      .filter(
        (rental) =>
          rental.clientId === session?.user.id ||
          (rental.channel === 'COUNTER' && nit && rental.nit === nit),
      )
      .filter((rental) => this.matches(rental, url));
    return paged(items, url.searchParams);
  }

  private ofBranch(session: Session | null, url: URL) {
    const branchId = this.branchOf(session);
    const items = [...this.rentals.values()].filter(
      (rental) => rental.branchId === branchId && this.matches(rental, url),
    );
    return paged(items, url.searchParams);
  }

  private confirm(session: Session | null, id: string, body: Body) {
    const rental = this.ofMyBranch(session, id);
    if (rental.status !== 'REQUESTED') throw conflict('Este alquiler ya no está esperando precio.');
    if (this.departed(rental)) throw unprocessable(DEPARTURE_PASSED);
    rental.status = 'CONFIRMED';
    rental.price = body.price;
    rental.confirmedAt = this.gateway.now().toISOString();
    if (body.distanceKm) rental.distanceKm = body.distanceKm;
    return rental;
  }

  private pay(request: FakeRequest, id: string) {
    const { session } = request;
    if (keyOf(request) !== id) throw badRequest('Datos no válidos.');
    const { paidOn } = request.body as { paidOn: string };
    const rental = this.find(id);
    const online = rental.channel === 'ONLINE';
    if (
      online ? rental.clientId !== session?.user.id : rental.branchId !== this.branchOf(session)
    ) {
      throw notFound(NOT_FOUND);
    }
    if (rental.status === 'CANCELLED') throw conflict('Este alquiler fue cancelado.');
    if (rental.status === 'PAID') {
      if (rental.paidOn !== paidOn) throw conflict(KEY_REUSED);
      return rental;
    }
    if (rental.status === 'REQUESTED')
      throw conflict('El precio de este alquiler aún no está listo.');
    if (this.departed(rental)) throw unprocessable(DEPARTURE_PASSED);
    if (online) {
      this.gateway.clients.debit(rental.clientId as string, {
        kind: 'RENTAL',
        amount: rental.price as number,
        reference: id,
        description: `Alquiler ${String(rental.originLabel)} a ${String(rental.destinationLabel)}`,
        occurredOn: paidOn,
      });
    }
    rental.status = 'PAID';
    rental.paidOn = paidOn;
    rental.paidAt = this.gateway.now().toISOString();
    this.requests.set(id, { status: 'PENDING', tripId: null });
    return rental;
  }

  private cancel(session: Session | null, id: string) {
    const rental = this.find(id);
    const mine = rental.clientId === session?.user.id || rental.branchId === session?.user.branchId;
    if (!mine) throw notFound(NOT_FOUND);
    if (rental.status === 'PAID') throw conflict('Este alquiler ya está pagado.');
    rental.status = 'CANCELLED';
    rental.cancelledAt = this.gateway.now().toISOString();
    return rental;
  }

  private view(id: string) {
    const rental = this.find(id);
    const request = this.requests.get(id) as RentalRequest;
    return {
      id,
      branchId: rental.branchId,
      clientName: rental.clientName,
      nit: rental.nit,
      originLabel: rental.originLabel,
      destinationLabel: rental.destinationLabel,
      departureAt: rental.departureAt,
      returnAt: rental.returnAt,
      passengers: rental.passengers,
      distanceKm: rental.distanceKm,
      price: rental.price,
      status: request.status,
      tripId: request.tripId,
    };
  }

  private listRequests(session: Session | null, url: URL) {
    const branchId = this.branchOf(session);
    const status = url.searchParams.get('status') ?? 'PENDING';
    const items = [...this.requests.keys()]
      .filter((id) => this.find(id).branchId === branchId)
      .filter((id) => status === 'all' || this.requests.get(id)?.status === status)
      .filter((id) => this.matches(this.find(id), url))
      .map((id) => this.view(id));
    return paged(items, url.searchParams);
  }

  private assign(session: Session | null, id: string, body: Body) {
    const branchId = this.branchOf(session);
    const request = this.requests.get(id);
    const rental = this.rentals.get(id);
    if (!request || !rental || rental.branchId !== branchId) throw notFound(NOT_FOUND);
    if (request.status === 'CANCELLED')
      throw conflict('Este alquiler fue cancelado. Ya no se le asigna bus.');
    if (request.status === 'ASSIGNED') throw conflict('Ese alquiler ya tiene bus y chofer.');
    const bus = this.gateway.buses.find((candidate) => candidate.id === body.busId);
    const driver = this.gateway.drivers.find((candidate) => candidate.id === body.driverId);
    if (!bus || bus.branchId !== branchId) throw conflict('No encontramos ese bus en tu sucursal.');
    if (!driver || driver.branchId !== branchId)
      throw conflict('No encontramos ese chofer en tu sucursal.');
    if ((bus.capacity as number) < (rental.passengers as number)) {
      throw conflict('Ese bus tiene menos asientos que pasajeros del alquiler.');
    }
    const start = Math.max(Date.parse(rental.departureAt as string), this.gateway.now().getTime());
    const end = Date.parse(body.estimatedArrivalAt as string);
    if (end <= start)
      throw conflict('La llegada estimada debe ser después de la salida del alquiler.');
    const busy = (field: 'busId' | 'driverId', value: string) =>
      this.gateway.trips.some(
        (trip) =>
          trip[field] === value &&
          trip.status !== 'COMPLETED' &&
          overlaps(
            start,
            end,
            Date.parse(trip.departureAt as string),
            Date.parse(trip.estimatedArrivalAt as string),
          ),
      );
    if (busy('busId', bus.id)) throw conflict('Ese bus ya tiene un viaje en ese horario.');
    if (busy('driverId', driver.id)) throw conflict('Ese chofer ya tiene un viaje en ese horario.');
    const trip: Row = {
      id: this.gateway.nextId(),
      type: 'RENTAL',
      status: 'SCHEDULED',
      branchId,
      routeId: null,
      originName: rental.originLabel,
      destinationName: rental.destinationLabel,
      busId: bus.id,
      busPlate: bus.plate,
      driverId: driver.id,
      driverName: driver.fullName,
      departureAt: new Date(start).toISOString(),
      estimatedArrivalAt: body.estimatedArrivalAt,
      ticketPrice: null,
      capacity: bus.capacity,
      departedAt: null,
      rentalId: id,
    };
    this.gateway.trips.push(trip);
    request.status = 'ASSIGNED';
    request.tripId = trip.id;
    return trip;
  }

  // The saga of a paid rental that ends: the trip goes, the money comes back, the rental is cancelled.
  private cancelPaid(session: Session | null, id: string) {
    const branchId = this.branchOf(session);
    const request = this.requests.get(id);
    const rental = this.rentals.get(id);
    if (!request || !rental || rental.branchId !== branchId) {
      throw notFound(
        'Todavía estamos registrando el pago de este alquiler. Intenta en un momento.',
      );
    }
    if (request.status === 'CANCELLED') return this.view(id);
    const trip = this.gateway.trips.find((candidate) => candidate.id === request.tripId);
    if (trip && trip.status !== 'SCHEDULED') {
      throw conflict('El viaje de este alquiler ya salió. Ya no se puede cancelar.');
    }
    if (trip) this.gateway.trips.splice(this.gateway.trips.indexOf(trip), 1);
    request.status = 'CANCELLED';
    request.tripId = null;
    rental.status = 'CANCELLED';
    rental.cancelledAt = this.gateway.now().toISOString();
    if (rental.channel === 'ONLINE') {
      this.gateway.clients.refund(rental.clientId as string, id, 'Devolución: alquiler cancelado');
    }
    return this.view(id);
  }
}
