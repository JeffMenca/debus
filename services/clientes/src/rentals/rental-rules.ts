import {
  CONSUMER_NIT,
  type RentalConfirmedPayload,
  type RentalListQuery,
  type RentalPaidPayload,
  escapeLikePattern,
  foldSearchText,
  guatemalaDayRange,
  rentalConfirmedPayloadSchema,
  rentalPaidPayloadSchema,
} from '@debus/contracts';
import type { Identity } from '@debus/server';
import type { Prisma, Rental as RentalRow } from '../generated/prisma/client';

export type RentalProblem =
  | 'rentalNotRequested'
  | 'rentalNotConfirmed'
  | 'rentalCancelled'
  | 'rentalAlreadyPaid'
  | 'rentalPaidByClient'
  | 'departurePassed'
  | 'keyReused';

const DESCRIPTION_MAX = 200;
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export const rentalSearchText = (rental: {
  clientName: string;
  nit: string;
  originLabel: string;
  destinationLabel: string;
}): string =>
  foldSearchText(
    [rental.clientName, rental.nit, rental.originLabel, rental.destinationLabel].join(' '),
  );

export const departurePassed = (departureAt: Date, now: Date): boolean =>
  departureAt.getTime() <= now.getTime();

// A client acts on the rentals they asked for; the branch admin on those of the branch.
export function visibleTo(rental: RentalRow, actor: Identity): boolean {
  if (actor.role === 'CLIENT') return rental.clientId === actor.userId;
  if (actor.role === 'BRANCH_ADMIN') return rental.branchId === actor.branchId;
  return false;
}

export function confirmProblem(rental: RentalRow): RentalProblem | null {
  if (rental.status === 'CANCELLED') return 'rentalCancelled';
  return rental.status === 'REQUESTED' ? null : 'rentalNotRequested';
}

// The client pays an online rental from the wallet; the branch takes the cash of a counter one.
// A paid rental passes, so a retry with the same key answers what was recorded.
export function paymentProblem(
  rental: RentalRow,
  actor: Identity,
  now: Date,
): RentalProblem | null {
  if (rental.status === 'CANCELLED') return 'rentalCancelled';
  if (rental.channel === 'ONLINE' && actor.role !== 'CLIENT') return 'rentalPaidByClient';
  if (rental.status === 'PAID') return null;
  if (rental.status === 'REQUESTED') return 'rentalNotConfirmed';
  return departurePassed(rental.departureAt, now) ? 'departurePassed' : null;
}

export const paymentReplayProblem = (rental: RentalRow, paidOn: string): RentalProblem | null =>
  rental.paidOn && isoDay(rental.paidOn) === paidOn ? null : 'keyReused';

// Only what is not paid is cancelled here; a paid rental is cancelled by viajes (RentalCancelled).
export const cancelProblem = (rental: RentalRow): RentalProblem | null =>
  rental.status === 'PAID' ? 'rentalAlreadyPaid' : null;

// The counter rentals made with the NIT of the profile belong to its history too.
export function historyWhere(profile: {
  userId: string;
  nit: string | null;
}): Prisma.RentalWhereInput {
  const own = { clientId: profile.userId };
  if (!profile.nit || profile.nit === CONSUMER_NIT) return own;
  return { OR: [own, { clientId: null, nit: profile.nit }] };
}

export const rentalPaymentDescription = (rental: RentalRow): string =>
  `Alquiler ${rental.originLabel} - ${rental.destinationLabel}`.slice(0, DESCRIPTION_MAX);

const tripOf = (rental: RentalRow) => ({
  rentalId: rental.id,
  branchId: rental.branchId,
  clientName: rental.clientName,
  originLabel: rental.originLabel,
  destinationLabel: rental.destinationLabel,
  departureAt: rental.departureAt.toISOString(),
  returnAt: rental.returnAt?.toISOString() ?? null,
  passengers: rental.passengers,
  distanceKm: rental.distanceKm.toNumber(),
  price: rental.price?.toNumber(),
});

export const toRentalPaid = (rental: RentalRow): RentalPaidPayload =>
  rentalPaidPayloadSchema.parse({
    ...tripOf(rental),
    clientId: rental.clientId,
    nit: rental.nit,
    email: rental.email,
    paidOn: rental.paidOn && isoDay(rental.paidOn),
  });

export const toRentalConfirmed = (rental: RentalRow): RentalConfirmedPayload =>
  rentalConfirmedPayloadSchema.parse({
    ...tripOf(rental),
    clientId: rental.clientId,
    email: rental.email,
    confirmedAt: rental.confirmedAt?.toISOString(),
  });

// The CHECK rentals_price_when_confirmed guarantees it past REQUESTED.
export function confirmedPrice(rental: RentalRow): number {
  if (!rental.price) throw new Error(`Rental ${rental.id} has no confirmed price`);
  return rental.price.toNumber();
}

export function rentalListWhere(query: RentalListQuery): Prisma.RentalWhereInput {
  const departureAt = guatemalaDayRange(query.from, query.to);
  return {
    ...(query.status !== 'all' && { status: query.status }),
    ...(query.q && { searchText: { contains: escapeLikePattern(query.q) } }),
    ...((query.from || query.to) && { departureAt }),
  };
}
