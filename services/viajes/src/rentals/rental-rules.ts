import { isLaterInstant } from '@debus/contracts';
import type { RentalRequestStatus } from '../generated/prisma/client';
import type { TripProblem } from '../trips/trip-messages';

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
  if (!isLaterInstant(input.estimatedArrivalAt, request.departureAt.toISOString())) {
    return 'rentalArrivalBeforeDeparture';
  }
  // A rental that was not assigned in time still gets its bus while the trip can be made: the
  // real departure is recorded late, and a deleted trip must always be assignable again.
  if (new Date(input.estimatedArrivalAt) <= input.now) return 'rentalArrivalInPast';
  // The bus stays with the client until the return, so it is not free before that.
  if (request.returnAt && new Date(input.estimatedArrivalAt) < request.returnAt) {
    return 'rentalArrivalBeforeReturn';
  }
  return null;
}
