import {
  type AssignRentalRequest,
  type RentalRequest,
  guatemalaDateTime,
  isLaterInstant,
} from '@debus/contracts';
import { type DayTime, splitGuatemala } from './schedule';

const RENTAL_TRIP_HOURS = 4;
const HOUR_MS = 3_600_000;

// A first guess for the estimated arrival that the person can change: the return of the client, or
// a few hours after leaving when the rental is one way.
export function defaultRentalArrival(request: RentalRequest): DayTime {
  const fromRental =
    request.returnAt ??
    new Date(Date.parse(request.departureAt) + RENTAL_TRIP_HOURS * HOUR_MS).toISOString();
  // A rental assigned late cannot arrive in the past.
  const soonest = new Date(Date.now() + RENTAL_TRIP_HOURS * HOUR_MS).toISOString();
  return splitGuatemala(Date.parse(fromRental) > Date.now() ? fromRental : soonest);
}

export const ASSIGN_PROBLEMS = {
  busId: 'Elige el bus.',
  driverId: 'Elige el chofer.',
  arrivalDay: 'Elige el día de llegada.',
  arrivalTime: 'Elige la hora de llegada.',
  arrivalOrder: 'La llegada debe ser después de la salida del alquiler.',
  arrivalInPast: 'La llegada estimada ya pasó. Elige una llegada que todavía no haya ocurrido.',
  arrivalBeforeReturn: 'La llegada estimada no puede ser antes del regreso del cliente.',
} as const;

export type AssignProblems = Partial<
  Record<'busId' | 'driverId' | 'arrivalDay' | 'arrivalTime', string>
>;

export interface AssignValues {
  busId: string;
  driverId: string;
  arrival: DayTime;
}

export function assignRequestFrom(
  values: AssignValues,
  rental: Pick<RentalRequest, 'departureAt' | 'returnAt'>,
):
  | { request: AssignRentalRequest; problems?: undefined }
  | { request?: undefined; problems: AssignProblems } {
  const { day, time } = values.arrival;
  const estimatedArrivalAt = day && time ? guatemalaDateTime(day, time) : null;
  const problems: AssignProblems = {
    ...(!values.busId && { busId: ASSIGN_PROBLEMS.busId }),
    ...(!values.driverId && { driverId: ASSIGN_PROBLEMS.driverId }),
    ...(!day && { arrivalDay: ASSIGN_PROBLEMS.arrivalDay }),
    ...(!time && { arrivalTime: ASSIGN_PROBLEMS.arrivalTime }),
  };
  if (estimatedArrivalAt) {
    if (!isLaterInstant(estimatedArrivalAt, rental.departureAt)) {
      problems.arrivalTime = ASSIGN_PROBLEMS.arrivalOrder;
    } else if (Date.parse(estimatedArrivalAt) <= Date.now()) {
      // A late rental is still assigned, as long as the trip can still be made.
      problems.arrivalTime = ASSIGN_PROBLEMS.arrivalInPast;
    } else if (rental.returnAt && Date.parse(estimatedArrivalAt) < Date.parse(rental.returnAt)) {
      // The bus stays with the client until the return.
      problems.arrivalTime = ASSIGN_PROBLEMS.arrivalBeforeReturn;
    }
  }
  if (Object.keys(problems).length > 0 || !estimatedArrivalAt) return { problems };
  return {
    request: { busId: values.busId, driverId: values.driverId, estimatedArrivalAt },
  };
}

export type AssignClashField = 'bus' | 'driver' | 'arrival';

// The service answers a refusal with a sentence about what is wrong; it goes next to the field it
// names. Anything else (the service is busy, the rental is already assigned) goes on top.
export function assignClashFieldOf(message: string): AssignClashField | null {
  // "Ese alquiler ya tiene bus y chofer." names the rental, not a field.
  if (/^Ese alquiler\b/i.test(message)) return null;
  if (/\bbus\b/i.test(message)) return 'bus';
  if (/\bchofer\b/i.test(message)) return 'driver';
  if (/\bllegada\b/i.test(message)) return 'arrival';
  return null;
}
