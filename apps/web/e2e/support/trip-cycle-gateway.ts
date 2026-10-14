import { randomUUID } from 'node:crypto';
import {
  type RentalToAssign,
  type Trip,
  type TripDetail,
  RENTAL_DRIVER_BONUS,
  assignRentalRequestSchema,
  foldSearchText,
  isLaterInstant,
  pageArgs,
  recordArrivalRequestSchema,
  recordDepartureRequestSchema,
  rentalRequestListQuerySchema,
  toPage,
  tripDetailSchema,
} from '@debus/contracts';
import { FLEET_BRANCH_ID, dayFromToday } from './fleet-gateway';
import type { TripsFleet } from './trips-gateway';

// What a call answers: the status and, when there is one, the body.
export interface Reply {
  status: number;
  json?: unknown;
}

type Departure = NonNullable<TripDetail['departure']>;
type Arrival = NonNullable<TripDetail['arrival']>;

export interface TripCycleSeed {
  // The rentals already paid that wait for a bus and a driver.
  rentals?: RentalToAssign[];
  // Trips that already left, or arrived, when the test starts.
  records?: { tripId: string; departure: Departure; arrival?: Arrival }[];
  // Quetzales per km the system admin configured; null means none is configured.
  depreciationPerKm?: number | null;
  // Who is signed in: a driver sees only their own trips and the records carry their role.
  actingAs?: { role: 'BRANCH_ADMIN' | 'DRIVER'; driverId?: string };
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
// The same texts the viajes service answers with.
export const CYCLE_MESSAGES = {
  tripNotFound: 'No encontramos ese viaje.',
  alreadyDeparted: 'La salida de este viaje ya fue registrada.',
  departureBusInactive:
    'El bus de este viaje fue desactivado. Elimina el viaje y prográmalo con otro bus.',
  departureDriverInactive:
    'El chofer de este viaje fue desactivado. Elimina el viaje y prográmalo con otro chofer.',
  startMileageBelowBus:
    'El kilometraje inicial no puede ser menor que el último registrado del bus.',
  departureInFuture: 'La hora real de salida no puede ser en el futuro.',
  notOnTheRoad: 'Primero registra la salida de este viaje.',
  alreadyArrived: 'La llegada de este viaje ya fue registrada.',
  arrivalBeforeDeparture: 'La llegada debe ser después de la salida.',
  arrivalInFuture: 'La hora real de llegada no puede ser en el futuro.',
  endMileageBelowStart: 'El kilometraje final no puede ser menor que el inicial.',
  noDepreciationRate:
    'Aún no hay monto de depreciación vigente para ese día. Pide al admin del sistema que lo configure.',
  tripStarted: 'Este viaje ya salió. Solo se eliminan viajes que no han salido.',
  rentalNotFound: 'No encontramos ese alquiler.',
  rentalAssigned: 'Ese alquiler ya tiene bus y chofer.',
  rentalBusTooSmall: 'Ese bus tiene menos asientos que pasajeros del alquiler.',
  rentalArrivalBeforeDeparture: 'La llegada estimada debe ser después de la salida del alquiler.',
  busNotFound: 'No encontramos ese bus en tu sucursal.',
  busInactive: 'Ese bus está desactivado.',
  busInWorkshop: 'Ese bus está en taller.',
  busBusy: 'Ese bus ya tiene un viaje en ese horario.',
  driverNotFound: 'No encontramos ese chofer en tu sucursal.',
  driverInactive: 'Ese chofer está desactivado.',
  driverBusy: 'Ese chofer ya tiene un viaje en ese horario.',
} as const;

const DEFAULT_DEPRECIATION = 0.85;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const reply = (status: number, json?: unknown): Reply => ({ status, json });
const refuse = (status: number, message: string): Reply =>
  reply(status, { statusCode: status, message });

export const overlaps = (
  a: { departureAt: string; estimatedArrivalAt: string },
  b: { departureAt: string; estimatedArrivalAt: string },
) =>
  isLaterInstant(a.estimatedArrivalAt, b.departureAt) &&
  isLaterInstant(b.estimatedArrivalAt, a.departureAt);

// Plays the trip cycle of the viajes service on the same trips the list shows: departures and
// arrivals that cannot be changed, trips that can only be deleted before they leave, and the
// paid rentals that wait for a bus. It keeps the same status codes and texts as the service.
export function createTripCycle(fleet: TripsFleet, trips: Trip[], seed: TripCycleSeed = {}) {
  const rentals = structuredClone(seed.rentals ?? []);
  const records = new Map<string, { departure: Departure; arrival?: Arrival }>(
    structuredClone(seed.records ?? []).map(({ tripId, ...record }) => [tripId, record]),
  );
  const actingAs = seed.actingAs ?? { role: 'BRANCH_ADMIN' as const };
  const depreciationPerKm =
    seed.depreciationPerKm === undefined ? DEFAULT_DEPRECIATION : seed.depreciationPerKm;

  const tripOf = (id: string | undefined) => trips.find((trip) => trip.id === id);
  const busOf = (trip: Trip) => fleet.buses.find((bus) => bus.id === trip.busId);
  const driverOf = (trip: Trip) => fleet.drivers.find((driver) => driver.id === trip.driverId);

  function detailOf(trip: Trip): TripDetail {
    const bus = busOf(trip);
    const driver = driverOf(trip);
    const record = records.get(trip.id);
    const distanceKm =
      fleet.routes.find((route) => route.id === trip.routeId)?.distanceKm ??
      rentals.find((rental) => rental.tripId === trip.id)?.distanceKm ??
      null;
    return tripDetailSchema.parse({
      ...trip,
      distanceKm,
      busActive: bus?.active ?? true,
      driverActive: driver?.active ?? true,
      suggestedStartMileageKm: bus?.mileageKm ?? 0,
      depreciationPerKmToday: depreciationPerKm,
      expectedDriverPay: cents(
        (driver?.baseSalary ?? 0) * (trip.type === 'RENTAL' ? 1 + RENTAL_DRIVER_BONUS : 1),
      ),
      canDelete: trip.status === 'SCHEDULED',
      departure: record?.departure ?? null,
      arrival: record?.arrival ?? null,
    });
  }

  const notFound = () => refuse(404, CYCLE_MESSAGES.tripNotFound);

  return {
    rentals,
    records,
    actingAs,
    // A driver is told only about their own trips.
    visibleTrips: () =>
      actingAs.role === 'DRIVER'
        ? trips.filter((trip) => trip.driverId === actingAs.driverId)
        : trips,

    detail(id: string): Reply {
      const trip = tripOf(id);
      return trip ? reply(200, detailOf(trip)) : notFound();
    },

    recordDeparture(id: string, body: unknown): Reply {
      const trip = tripOf(id);
      if (!trip) return notFound();
      const parsed = recordDepartureRequestSchema.safeParse(body);
      if (!parsed.success) return refuse(400, INVALID);
      if (records.has(trip.id)) return refuse(409, CYCLE_MESSAGES.alreadyDeparted);
      if (busOf(trip)?.active === false) return refuse(409, CYCLE_MESSAGES.departureBusInactive);
      if (driverOf(trip)?.active === false) {
        return refuse(409, CYCLE_MESSAGES.departureDriverInactive);
      }
      if (parsed.data.startMileageKm < (busOf(trip)?.mileageKm ?? 0)) {
        return refuse(409, CYCLE_MESSAGES.startMileageBelowBus);
      }
      if (isLaterInstant(parsed.data.departedAt, new Date().toISOString())) {
        return refuse(409, CYCLE_MESSAGES.departureInFuture);
      }
      records.set(trip.id, {
        departure: { ...parsed.data, recordedByRole: actingAs.role },
      });
      trip.status = 'IN_TRANSIT';
      return reply(201, detailOf(trip));
    },

    recordArrival(id: string, body: unknown): Reply {
      const trip = tripOf(id);
      if (!trip) return notFound();
      const parsed = recordArrivalRequestSchema.safeParse(body);
      if (!parsed.success) return refuse(400, INVALID);
      const record = records.get(trip.id);
      if (record?.arrival) return refuse(409, CYCLE_MESSAGES.alreadyArrived);
      if (!record) return refuse(409, CYCLE_MESSAGES.notOnTheRoad);
      const { departure } = record;
      if (Date.parse(parsed.data.arrivedAt) < Date.parse(departure.departedAt)) {
        return refuse(409, CYCLE_MESSAGES.arrivalBeforeDeparture);
      }
      if (isLaterInstant(parsed.data.arrivedAt, new Date().toISOString())) {
        return refuse(409, CYCLE_MESSAGES.arrivalInFuture);
      }
      if (parsed.data.endMileageKm < departure.startMileageKm) {
        return refuse(409, CYCLE_MESSAGES.endMileageBelowStart);
      }
      if (depreciationPerKm === null) return refuse(409, CYCLE_MESSAGES.noDepreciationRate);
      const distanceKm = parsed.data.endMileageKm - departure.startMileageKm;
      record.arrival = {
        ...parsed.data,
        distanceKm,
        depreciationPerKm,
        depreciationAmount: cents(distanceKm * depreciationPerKm),
        driverPay: detailOf(trip).expectedDriverPay,
        recordedByRole: actingAs.role,
      };
      trip.status = 'COMPLETED';
      // The fleet service raises the mileage of the bus when it hears the trip was completed.
      const bus = busOf(trip);
      if (bus) bus.mileageKm = Math.max(bus.mileageKm, parsed.data.endMileageKm);
      return reply(201, detailOf(trip));
    },

    remove(id: string): Reply {
      const trip = tripOf(id);
      if (!trip) return notFound();
      if (trip.status !== 'SCHEDULED') return refuse(409, CYCLE_MESSAGES.tripStarted);
      trips.splice(trips.indexOf(trip), 1);
      // A deleted rental is already paid: it goes back to the rentals waiting for a bus.
      const rental = rentals.find((item) => item.tripId === trip.id);
      if (rental) Object.assign(rental, { status: 'PENDING', tripId: null });
      return reply(204);
    },

    listRentals(params: URLSearchParams): Reply {
      const parsed = rentalRequestListQuerySchema.safeParse(Object.fromEntries(params));
      if (!parsed.success) return refuse(400, INVALID);
      const { status, q, ...paging } = parsed.data;
      const shown = rentals
        .filter(
          (rental) =>
            (status === 'all' || rental.status === status) &&
            (!q ||
              foldSearchText(
                `${rental.clientName} ${rental.nit} ${rental.originLabel} ${rental.destinationLabel}`,
              ).includes(q)),
        )
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt) || a.id.localeCompare(b.id));
      const { skip, take } = pageArgs(paging);
      return reply(200, toPage(shown.slice(skip, skip + take), shown.length, paging));
    },

    assignRental(id: string, body: unknown): Reply {
      const rental = rentals.find((item) => item.id === id);
      if (!rental) return refuse(404, CYCLE_MESSAGES.rentalNotFound);
      const parsed = assignRentalRequestSchema.safeParse(body);
      if (!parsed.success) return refuse(400, INVALID);
      if (rental.status === 'ASSIGNED') return refuse(409, CYCLE_MESSAGES.rentalAssigned);
      const input = parsed.data;
      if (!isLaterInstant(input.estimatedArrivalAt, rental.departureAt)) {
        return refuse(409, CYCLE_MESSAGES.rentalArrivalBeforeDeparture);
      }
      const bus = fleet.buses.find((item) => item.id === input.busId);
      if (!bus) return refuse(409, CYCLE_MESSAGES.busNotFound);
      if (!bus.active) return refuse(409, CYCLE_MESSAGES.busInactive);
      if (bus.operationalStatus === 'IN_WORKSHOP') return refuse(409, CYCLE_MESSAGES.busInWorkshop);
      if (bus.capacity < rental.passengers) return refuse(409, CYCLE_MESSAGES.rentalBusTooSmall);
      const driver = fleet.drivers.find((item) => item.id === input.driverId);
      if (!driver) return refuse(409, CYCLE_MESSAGES.driverNotFound);
      if (!driver.active) return refuse(409, CYCLE_MESSAGES.driverInactive);
      const window = {
        departureAt: rental.departureAt,
        estimatedArrivalAt: input.estimatedArrivalAt,
      };
      const live = trips.filter((trip) => trip.status !== 'COMPLETED');
      if (live.some((trip) => trip.busId === bus.id && overlaps(trip, window))) {
        return refuse(409, CYCLE_MESSAGES.busBusy);
      }
      if (live.some((trip) => trip.driverId === driver.id && overlaps(trip, window))) {
        return refuse(409, CYCLE_MESSAGES.driverBusy);
      }
      const created: Trip = {
        id: randomUUID(),
        type: 'RENTAL',
        status: 'SCHEDULED',
        branchId: FLEET_BRANCH_ID,
        routeId: null,
        originName: rental.originLabel,
        destinationName: rental.destinationLabel,
        busId: bus.id,
        busPlate: bus.plate,
        driverId: driver.id,
        driverName: driver.fullName,
        departureAt: rental.departureAt,
        estimatedArrivalAt: input.estimatedArrivalAt,
        ticketPrice: null,
        capacity: bus.capacity,
      };
      trips.push(created);
      Object.assign(rental, { status: 'ASSIGNED', tripId: created.id });
      return reply(201, created);
    },
  };
}

// A paid rental, six days from today at 06:00 and back at 16:00, for 38 people.
export const sampleRental = (overrides: Partial<RentalToAssign> = {}): RentalToAssign => ({
  id: randomUUID(),
  branchId: FLEET_BRANCH_ID,
  clientName: 'Colegio San José',
  nit: '1234567-8',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Antigua Guatemala',
  departureAt: instant(6, '12:00:00'),
  returnAt: instant(6, '22:00:00'),
  passengers: 38,
  distanceKm: 210,
  price: 6300,
  status: 'PENDING',
  tripId: null,
  ...overrides,
});

// A UTC instant on a day counted from today (Guatemala is six hours behind UTC all year).
function instant(daysFromToday: number, utcTime: string): string {
  return `${dayFromToday(daysFromToday)}T${utcTime}.000Z`;
}
