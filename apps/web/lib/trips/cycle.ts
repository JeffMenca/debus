import {
  EARLY_DEPARTURE_TOLERANCE_MS,
  GUATEMALA_TIME_ZONE,
  MAX_TRIP_DISTANCE_KM,
  MILEAGE_MAX_KM,
  type RecordArrivalRequest,
  type RecordDepartureRequest,
  guatemalaDateTime,
  moneySchema,
  recordArrivalRequestSchema,
  recordDepartureRequestSchema,
  todayInGuatemala,
} from '@debus/contracts';
import { formatCount } from '@/lib/format';
import { parseMoney, parseWholeNumber } from '@/lib/number-input';
import { splitGuatemala } from './schedule';

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: GUATEMALA_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// The values the person reads before confirming; the server computes and stores the real ones.
export function arrivalPreview(input: {
  startMileageKm: number;
  endMileageKm: number | null;
  depreciationPerKm: number | null;
  expectedDriverPay: number;
}) {
  const covered = input.endMileageKm === null ? null : input.endMileageKm - input.startMileageKm;
  // A typing mistake shows its error and no figures, so nothing absurd is ever printed.
  const distanceKm =
    covered !== null && covered >= 0 && covered <= MAX_TRIP_DISTANCE_KM ? covered : null;
  return {
    distanceKm,
    depreciationAmount:
      distanceKm !== null && input.depreciationPerKm !== null
        ? cents(distanceKm * input.depreciationPerKm)
        : null,
    driverPay: input.expectedDriverPay,
  };
}

export const nowInGuatemala = (now: Date = new Date()) => ({
  day: todayInGuatemala(now),
  time: TIME.format(now),
});

// "05/10/2026 05:34", the day and hour of Guatemala as the saved records show them.
export function formatMoment(iso: string): string {
  const { day, time } = splitGuatemala(iso);
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year} ${time}`;
}

export const CYCLE_PROBLEMS = {
  departureDay: 'Elige la fecha de salida.',
  departureTime: 'Elige la hora de salida.',
  departureTooEarly:
    'Este viaje está programado para más tarde. Solo puedes registrar su salida desde 12 horas antes.',
  startMileage: 'Escribe el kilometraje inicial con números enteros.',
  arrivalDay: 'Elige la fecha de llegada.',
  arrivalTime: 'Elige la hora de llegada.',
  endMileage: 'Escribe el kilometraje final con números enteros.',
  endMileageBelow: (startMileageKm: number) =>
    `El kilometraje final no puede ser menor a ${formatCount(startMileageKm)}.`,
  fuel: 'Escribe el combustible total en quetzales, mayor que cero y con hasta dos decimales.',
  distanceTooLong:
    'Ese kilometraje final es demasiado alto para un solo viaje. Revisa que esté bien escrito.',
  arrivalOrder: 'La llegada no puede ser antes de la salida.',
} as const;

export type CycleField = 'day' | 'time' | 'mileage' | 'fuel';
export type CycleProblems = Partial<Record<CycleField, string>>;
export const CYCLE_FIELD_ORDER: readonly CycleField[] = ['day', 'time', 'mileage', 'fuel'];

export type CycleOutcome<R> =
  { request: R; problems?: undefined } | { request?: undefined; problems: CycleProblems };

const isEmpty = (problems: CycleProblems) => Object.keys(problems).length === 0;
const isTooEarly = (departedAt: string, scheduledAt: string) =>
  Date.parse(departedAt) < Date.parse(scheduledAt) - EARLY_DEPARTURE_TOLERANCE_MS;

// What the person typed (a Guatemalan day and hour, mileage as text) becomes the request, or what is wrong.
export function departureRequestFrom(
  values: { day: string; time: string; mileage: string },
  scheduledAt?: string,
): CycleOutcome<RecordDepartureRequest> {
  const startMileageKm = parseWholeNumber(values.mileage);
  const departedAt = values.day && values.time ? guatemalaDateTime(values.day, values.time) : null;
  const problems: CycleProblems = {
    ...(!values.day && { day: CYCLE_PROBLEMS.departureDay }),
    ...(departedAt &&
      scheduledAt &&
      isTooEarly(departedAt, scheduledAt) && { day: CYCLE_PROBLEMS.departureTooEarly }),
    ...(!values.time && { time: CYCLE_PROBLEMS.departureTime }),
    ...((startMileageKm === null || startMileageKm > MILEAGE_MAX_KM) && {
      mileage: CYCLE_PROBLEMS.startMileage,
    }),
  };
  if (!isEmpty(problems) || startMileageKm === null || !departedAt) return { problems };
  return { request: recordDepartureRequestSchema.parse({ departedAt, startMileageKm }) };
}

function endMileageProblem(endMileageKm: number | null, startMileageKm: number) {
  if (endMileageKm === null || endMileageKm > MILEAGE_MAX_KM) return CYCLE_PROBLEMS.endMileage;
  if (endMileageKm < startMileageKm) return CYCLE_PROBLEMS.endMileageBelow(startMileageKm);
  if (endMileageKm - startMileageKm > MAX_TRIP_DISTANCE_KM) return CYCLE_PROBLEMS.distanceTooLong;
  return undefined;
}

// What is wrong with the mileage while it is still being typed; nothing until there is a number.
export const liveMileageProblem = (endMileageKm: number | null, startMileageKm: number) =>
  endMileageKm === null ? undefined : endMileageProblem(endMileageKm, startMileageKm);

export function arrivalRequestFrom(
  values: { day: string; time: string; mileage: string; fuel: string },
  departure: { startMileageKm: number; departedAt: string },
): CycleOutcome<RecordArrivalRequest> {
  const endMileageKm = parseWholeNumber(values.mileage);
  const fuelCost = parseMoney(values.fuel);
  const arrivedAt = values.day && values.time ? guatemalaDateTime(values.day, values.time) : null;
  const mileage = endMileageProblem(endMileageKm, departure.startMileageKm);
  const problems: CycleProblems = {
    ...(!values.day && { day: CYCLE_PROBLEMS.arrivalDay }),
    ...(!values.time && { time: CYCLE_PROBLEMS.arrivalTime }),
    ...(arrivedAt &&
      Date.parse(arrivedAt) <= Date.parse(departure.departedAt) && {
        time: CYCLE_PROBLEMS.arrivalOrder,
      }),
    ...(mileage && { mileage }),
    ...((fuelCost === null || !moneySchema.safeParse(fuelCost).success) && {
      fuel: CYCLE_PROBLEMS.fuel,
    }),
  };
  if (!isEmpty(problems) || !arrivedAt || endMileageKm === null || fuelCost === null) {
    return { problems };
  }
  return {
    request: recordArrivalRequestSchema.parse({ arrivedAt, endMileageKm, fuelCost }),
  };
}
