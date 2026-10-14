import {
  EARLY_DEPARTURE_TOLERANCE_MS,
  EVENT_AMOUNT_MAX,
  MAX_TRIP_DISTANCE_KM,
  RENTAL_DRIVER_BONUS,
  type TripStatus,
  type TripType,
} from '@debus/contracts';
import type { TripProblem } from './trip-messages';

// Phones and servers drift a little; a real time a few minutes ahead is still the present.
export const FUTURE_TOLERANCE_MS = 5 * 60_000;
const isInFuture = (instant: string, now: Date) =>
  new Date(instant).getTime() > now.getTime() + FUTURE_TOLERANCE_MS;
const isTooEarly = (departedAt: string, scheduledAt: Date) =>
  new Date(departedAt).getTime() < scheduledAt.getTime() - EARLY_DEPARTURE_TOLERANCE_MS;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function departureProblem(input: {
  status: TripStatus;
  busActive: boolean;
  driverActive: boolean;
  busMileageKm: number;
  startMileageKm: number;
  departedAt: string;
  scheduledAt: Date;
  now: Date;
}): TripProblem | null {
  if (input.status !== 'SCHEDULED') return 'alreadyDeparted';
  if (!input.busActive) return 'departureBusInactive';
  if (!input.driverActive) return 'departureDriverInactive';
  if (input.startMileageKm < input.busMileageKm) return 'startMileageBelowBus';
  if (isInFuture(input.departedAt, input.now)) return 'departureInFuture';
  if (isTooEarly(input.departedAt, input.scheduledAt)) return 'departureTooEarly';
  return null;
}

export function arrivalProblem(input: {
  status: TripStatus;
  departedAt: Date;
  startMileageKm: number;
  arrivedAt: string;
  endMileageKm: number;
  now: Date;
}): TripProblem | null {
  if (input.status === 'SCHEDULED') return 'notOnTheRoad';
  if (input.status === 'COMPLETED') return 'alreadyArrived';
  if (new Date(input.arrivedAt) <= input.departedAt) return 'arrivalBeforeDeparture';
  if (isInFuture(input.arrivedAt, input.now)) return 'arrivalInFuture';
  if (input.endMileageKm < input.startMileageKm) return 'endMileageBelowStart';
  if (input.endMileageKm - input.startMileageKm > MAX_TRIP_DISTANCE_KM) return 'distanceTooLong';
  return null;
}

export const driverPayFor = (type: TripType, baseSalary: number): number =>
  type === 'RENTAL' ? cents(baseSalary * (1 + RENTAL_DRIVER_BONUS)) : cents(baseSalary);

// The amounts are fixed here, once, with the depreciation in force on the day of arrival.
export function tripCosts(input: {
  type: TripType;
  startMileageKm: number;
  endMileageKm: number;
  depreciationPerKm: number;
  baseSalary: number;
}) {
  const distanceKm = input.endMileageKm - input.startMileageKm;
  return {
    distanceKm,
    depreciationAmount: cents(distanceKm * input.depreciationPerKm),
    driverPay: driverPayFor(input.type, input.baseSalary),
  };
}

// The depreciation travels in TripCompleted, whose contract has a ceiling for every amount.
export const costsProblem = (costs: { depreciationAmount: number }): TripProblem | null =>
  costs.depreciationAmount > EVENT_AMOUNT_MAX ? 'depreciationTooHigh' : null;

export const deletionProblem = (status: TripStatus): TripProblem | null =>
  status === 'SCHEDULED' ? null : 'tripStarted';
