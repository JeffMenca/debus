import {
  GUATEMALA_TIME_ZONE,
  type ScheduleTripRequest,
  guatemalaDateTime,
  isLaterInstant,
} from '@debus/contracts';

const AVERAGE_SPEED_KM_H = 50;
const MIN_HOURS = 1;
const HOUR_MS = 3_600_000;

// A first guess for the arrival that the person can change: the distance at an average speed.
export function suggestedArrival(departureIso: string, distanceKm: number): string {
  const hours = Math.max(MIN_HOURS, Math.ceil(distanceKm / AVERAGE_SPEED_KM_H));
  return new Date(Date.parse(departureIso) + hours * HOUR_MS).toISOString();
}

// en-CA gives YYYY-MM-DD and hourCycle h23 writes midnight as 00, not 24.
const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: GUATEMALA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface DayTime {
  day: string;
  time: string;
}

// The day and time of Guatemala, the way the date and time fields write them.
export function splitGuatemala(iso: string): DayTime {
  const part = Object.fromEntries(
    PARTS.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]),
  );
  return { day: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}` };
}

export type ClashField = 'route' | 'bus' | 'driver' | 'departure';

// The service answers a refusal with a sentence about what is wrong; the message goes next to the
// field it names. Anything else (the service is busy, the data is invalid) goes on top of the form.
export function clashFieldOf(message: string): ClashField | null {
  if (/\bruta\b/i.test(message)) return 'route';
  if (/\bbus\b/i.test(message)) return 'bus';
  if (/\bchofer\b/i.test(message)) return 'driver';
  if (/\bsalida\b/i.test(message)) return 'departure';
  return null;
}

export interface ScheduleValues {
  routeId: string;
  busId: string;
  driverId: string;
  departure: DayTime;
  arrival: DayTime;
}

export type ScheduleProblems = Partial<
  Record<
    | 'routeId'
    | 'busId'
    | 'driverId'
    | 'departureDay'
    | 'departureTime'
    | 'arrivalDay'
    | 'arrivalTime',
    string
  >
>;

export const SCHEDULE_PROBLEMS = {
  routeId: 'Elige la ruta del viaje.',
  busId: 'Elige el bus.',
  driverId: 'Elige el chofer.',
  departureDay: 'Elige el día de salida.',
  departureTime: 'Elige la hora de salida.',
  arrivalDay: 'Elige el día de llegada.',
  arrivalTime: 'Elige la hora de llegada.',
  arrivalOrder: 'La llegada debe ser después de la salida.',
} as const;

const instant = ({ day, time }: DayTime): string | null =>
  day && time ? guatemalaDateTime(day, time) : null;

// What the person picked (Guatemalan days and hours) becomes the request, or the list of what is missing.
export function scheduleRequestFrom(
  values: ScheduleValues,
):
  | { request: ScheduleTripRequest; problems?: undefined }
  | { request?: undefined; problems: ScheduleProblems } {
  const departureAt = instant(values.departure);
  const estimatedArrivalAt = instant(values.arrival);
  const problems: ScheduleProblems = {
    ...(!values.routeId && { routeId: SCHEDULE_PROBLEMS.routeId }),
    ...(!values.busId && { busId: SCHEDULE_PROBLEMS.busId }),
    ...(!values.driverId && { driverId: SCHEDULE_PROBLEMS.driverId }),
    ...(!values.departure.day && { departureDay: SCHEDULE_PROBLEMS.departureDay }),
    ...(!values.departure.time && { departureTime: SCHEDULE_PROBLEMS.departureTime }),
    ...(!values.arrival.day && { arrivalDay: SCHEDULE_PROBLEMS.arrivalDay }),
    ...(!values.arrival.time && { arrivalTime: SCHEDULE_PROBLEMS.arrivalTime }),
  };
  if (departureAt && estimatedArrivalAt && !isLaterInstant(estimatedArrivalAt, departureAt)) {
    problems.arrivalTime = SCHEDULE_PROBLEMS.arrivalOrder;
  }
  if (Object.keys(problems).length > 0 || !departureAt || !estimatedArrivalAt) return { problems };
  return {
    request: {
      routeId: values.routeId,
      busId: values.busId,
      driverId: values.driverId,
      departureAt,
      estimatedArrivalAt,
    },
  };
}

// How far along the road a bus is, from 0 (just left) to 1 (should have arrived).
export function progressOf(departureAt: string, estimatedArrivalAt: string, now: number): number {
  const start = Date.parse(departureAt);
  const share = (now - start) / (Date.parse(estimatedArrivalAt) - start);
  return Math.min(1, Math.max(0, share));
}
