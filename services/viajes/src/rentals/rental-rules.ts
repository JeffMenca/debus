import { isLaterInstant } from '@debus/contracts';
import type { RentalRequestStatus, TripStatus } from '../generated/prisma/client';
import { deletionProblem } from '../trips/trip-cycle-rules';
import type { TripProblem } from '../trips/trip-messages';

const MINUTE_MS = 60_000;

// A rental assigned after its requested time cannot start in the past: it leaves now.
export function tripDepartureFor(requestedDepartureAt: Date, now: Date): Date {
  if (requestedDepartureAt > now) return requestedDepartureAt;
  return new Date(Math.ceil((now.getTime() + 1) / MINUTE_MS) * MINUTE_MS);
}

// What must hold before a paid rental gets its bus and driver; the clashes with other trips are
// decided by flota and by the exclusion constraints of the database.
export function assignmentProblem(input: {
  request: {
    status: RentalRequestStatus;
    passengers: number;
    departureAt: Date;
    returnAt: Date | null;
  } | null;
  bus: { active: boolean; capacity: number; branchId: string } | null;
  driver: { active: boolean; branchId: string } | null;
  branchId: string;
  estimatedArrivalAt: string;
  now: Date;
}): TripProblem | null {
  const { request, bus, driver, branchId } = input;
  if (!request) return 'rentalNotFound';
  if (request.status !== 'PENDING') return 'rentalAssigned';
  if (!bus || bus.branchId !== branchId) return 'busNotFound';
  if (!bus.active) return 'busInactive';
  if (bus.capacity < request.passengers) return 'rentalBusTooSmall';
  if (!driver || driver.branchId !== branchId) return 'driverNotFound';
  if (!driver.active) return 'driverInactive';
  // A rental that was not assigned in time still gets its bus while the trip can be made: the
  // real departure is recorded late, and a deleted trip must always be assignable again.
  const arrivalAt = new Date(input.estimatedArrivalAt);
  if (arrivalAt <= input.now) return 'rentalArrivalInPast';
  const departureAt = tripDepartureFor(request.departureAt, input.now);
  if (!isLaterInstant(input.estimatedArrivalAt, departureAt.toISOString())) {
    return 'rentalArrivalBeforeDeparture';
  }
  // The bus stays with the client until the return, so it is not free before that.
  if (request.returnAt && arrivalAt < request.returnAt) {
    return 'rentalArrivalBeforeReturn';
  }
  return null;
}

// A paid rental is cancelled while its trip, if it has one, has not left. Without the request,
// RentalPaid has not reached viajes yet.
export function cancellationProblem(
  request: { status: RentalRequestStatus } | null,
  trip: { status: TripStatus } | null,
): TripProblem | null {
  if (!request) return 'rentalPaymentPending';
  if (request.status === 'ASSIGNED' && trip && deletionProblem(trip.status)) {
    return 'rentalTripStarted';
  }
  return null;
}
