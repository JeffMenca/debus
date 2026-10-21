import {
  CONSUMER_NIT,
  SEAT_SELECTION_MAX,
  type CounterSaleRequest,
  emailSchema,
  fullNameSchema,
  saleNitSchema,
} from '@debus/contracts';
import { formatQuetzales } from '@/lib/format';

// The most seats one sale may carry, the same limit the API applies.
export const SEAT_LIMIT = SEAT_SELECTION_MAX;

// Seat 7 reads 07, as it is painted on the bus.
export const formatSeat = (seat: number): string => String(seat).padStart(2, '0');

export function toggleSeat(selected: number[], seat: number): number[] {
  if (selected.includes(seat)) return selected.filter((taken) => taken !== seat);
  if (selected.length >= SEAT_LIMIT) return selected;
  return [...selected, seat].sort((a, b) => a - b);
}

// In cents, so Q 33.35 × 3 is Q 100.05 and not Q 100.04999...
export const saleTotal = (unitPrice: number, seats: number): number =>
  (Math.round(unitPrice * 100) * seats) / 100;

export const chargeLabel = (total: number): string =>
  total > 0 ? `Cobrar ${formatQuetzales(total)}` : 'Cobrar';

export interface SeatRow {
  left: number[];
  right: number[];
}

// Two seats on each side of the aisle, front to back, as the bus is laid out.
export function seatRows(capacity: number): SeatRow[] {
  const rows: SeatRow[] = [];
  for (let first = 1; first <= capacity; first += 4) {
    const seats = [first, first + 1, first + 2, first + 3].filter((seat) => seat <= capacity);
    rows.push({ left: seats.slice(0, 2), right: seats.slice(2) });
  }
  return rows;
}

export interface BuyerForm {
  nit: string;
  buyerName: string;
  email: string;
}

export type BuyerProblems = Partial<Record<keyof BuyerForm, string>>;

const written = (text: string): string | undefined => text.trim() || undefined;

// Everything is optional: an empty buyer is the generic client of the counter.
export function buyerProblems(form: BuyerForm): BuyerProblems {
  const problems: BuyerProblems = {};
  const nit = written(form.nit);
  const buyerName = written(form.buyerName);
  const email = written(form.email);
  if (nit && !saleNitSchema.safeParse(nit).success) {
    problems.nit = 'Revisa el NIT o déjalo vacío para consumidor final.';
  }
  if (buyerName && !fullNameSchema.safeParse(buyerName).success) {
    problems.buyerName = 'Escribe el nombre completo o déjalo vacío.';
  }
  if (email && !emailSchema.safeParse(email).success) {
    problems.email = 'Revisa el correo o déjalo vacío.';
  }
  return problems;
}

export function toCounterSaleRequest(
  tripId: string,
  seats: number[],
  paidOn: string,
  form: BuyerForm,
): CounterSaleRequest {
  const buyerName = written(form.buyerName);
  const email = written(form.email);
  return {
    tripId,
    seats,
    paidOn,
    nit: written(form.nit) ?? CONSUMER_NIT,
    ...(buyerName && { buyerName }),
    ...(email && { email }),
  };
}
