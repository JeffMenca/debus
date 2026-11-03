import {
  type CounterRentalRequest,
  type RentalRequest,
  guatemalaDateTime,
  guatemalaDepartmentSchema,
  isLaterInstant,
} from '@debus/contracts';
import { parseMoney, parseWholeNumber } from '@/lib/number-input';

// What the person is typing; everything stays text until it is sent.
export interface RentalDraft {
  branchId: string;
  origin: string;
  destination: string;
  departureDay: string;
  departureTime: string;
  roundTrip: boolean;
  returnDay: string;
  returnTime: string;
  passengers: string;
  distance: string;
}

export type RentalProblems = Partial<
  Record<
    'branchId' | 'origin' | 'destination' | 'departure' | 'return' | 'passengers' | 'distance',
    string
  >
>;

export interface CounterDraft {
  clientId: string;
  price: string;
}

export type CounterProblems = Partial<Record<keyof CounterDraft, string>>;

const MAX_PASSENGERS = 200;
const MAX_KM = 2000;
const LABEL_MAX = 120;

export const emptyRentalDraft = (today: string): RentalDraft => ({
  branchId: '',
  origin: '',
  destination: '',
  departureDay: today,
  departureTime: '07:00',
  roundTrip: false,
  returnDay: today,
  returnTime: '',
  passengers: '',
  distance: '',
});

export const emptyCounterDraft = (): CounterDraft => ({ clientId: '', price: '' });

// Kilometres with one decimal at most, as the contract takes them.
export function parseDistance(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d)?$/.test(clean)) return null;
  const km = Number(clean);
  return km > 0 && km <= MAX_KM ? km : null;
}

const label = (text: string): string | null => {
  const clean = text.trim();
  return clean && clean.length <= LABEL_MAX ? clean : null;
};

export function rentalRequestFrom(
  draft: RentalDraft,
  now: Date,
): { request?: RentalRequest; problems?: RentalProblems } {
  const problems: RentalProblems = {};
  const origin = label(draft.origin);
  const destination = label(draft.destination);
  const passengers = parseWholeNumber(draft.passengers);
  const distanceKm = parseDistance(draft.distance);
  const departureAt =
    draft.departureDay && draft.departureTime
      ? guatemalaDateTime(draft.departureDay, draft.departureTime)
      : null;
  const returnAt =
    draft.roundTrip && draft.returnDay && draft.returnTime
      ? guatemalaDateTime(draft.returnDay, draft.returnTime)
      : null;

  if (!draft.branchId) problems.branchId = 'Elige la sucursal que te atenderá.';
  if (!origin) problems.origin = 'Escribe de dónde salen.';
  if (!destination) problems.destination = 'Escribe a dónde van.';
  if (!departureAt) problems.departure = 'Elige el día y la hora de salida.';
  else if (!isLaterInstant(departureAt, now.toISOString())) {
    problems.departure = 'La salida debe ser en el futuro.';
  }
  if (draft.roundTrip && !returnAt) problems.return = 'Elige el día y la hora del regreso.';
  else if (returnAt && departureAt && !isLaterInstant(returnAt, departureAt)) {
    problems.return = 'El regreso debe ser después de la salida.';
  }
  if (!passengers || passengers > MAX_PASSENGERS) {
    problems.passengers = 'Escribe cuántas personas viajan, de 1 a 200.';
  }
  if (distanceKm === null) {
    problems.distance = 'Escribe los kilómetros aproximados, por ejemplo 92 o 92.5.';
  }

  if (Object.keys(problems).length > 0 || !origin || !destination || !departureAt) {
    return { problems };
  }
  return {
    request: {
      branchId: draft.branchId,
      originLabel: origin,
      destinationLabel: destination,
      departureAt,
      returnAt,
      passengers: passengers as number,
      distanceKm: distanceKm as number,
    },
  };
}

// At the counter the places are chosen from a list, and the client from those with an account.
export function counterRequestFrom(
  draft: RentalDraft,
  counter: CounterDraft,
  now: Date,
): { request?: CounterRentalRequest; problems?: RentalProblems & CounterProblems } {
  const trip = rentalRequestFrom(draft, now);
  const problems: RentalProblems & CounterProblems = { ...trip.problems };
  const origin = guatemalaDepartmentSchema.safeParse(draft.origin);
  const destination = guatemalaDepartmentSchema.safeParse(draft.destination);
  const price = parseMoney(counter.price);

  if (!origin.success) problems.origin = 'Elige el departamento de salida.';
  if (!destination.success) problems.destination = 'Elige el departamento de destino.';
  if (!counter.clientId) problems.clientId = 'Elige al cliente que alquila.';
  if (!price) problems.price = 'Escribe un precio mayor a Q 0.';

  if (!trip.request || !origin.success || !destination.success || !counter.clientId || !price) {
    return { problems };
  }
  return {
    request: {
      ...trip.request,
      originLabel: origin.data,
      destinationLabel: destination.data,
      clientId: counter.clientId,
      price,
    },
  };
}
