import {
  guatemalaDateTime,
  rentalEstimateSchema,
  rentalPageSchema,
  rentalRequestPageSchema,
  rentalSchema,
  type Rental,
  type RentalToAssign,
} from '@debus/contracts';
import { CLIENTES, IDEMPOTENCY_KEY, PAGE, VIAJES, withQuery } from '../api';
import type { SeedArea } from '../areas';
import { seedClient } from '../clients-catalog';
import type { SeedContext } from '../context';
import { HOUR_MS, addDays, paidOnFor } from '../dates';
import { GatewayError, type Session } from '../gateway-client';
import { Tally } from '../report';
import { isConflict, isPendingRegistration, pendingCopy, untilRegistered } from '../retry';
import {
  CRUISE_KM_PER_HOUR,
  branchAdminSession,
  loadFleet,
  resolveBranchIds,
} from '../stages/shared';
import { clientSession } from './client-accounts';
import { ensureBalance } from './client-wallet';
import { SEED_RENTALS, type SeedRental } from './rental-catalog';

// The payment of a rental reaches viajes by an event, a moment after it is made.
const PAYMENT_PENDING = pendingCopy('Todavía estamos registrando el pago');
const STILL_PAYING = 'Todavía estamos registrando el pago de este alquiler.';

interface Actors {
  admin: Session;
  // Who asks for the rental: the client, or the admin when it is agreed at the counter.
  asker: Session;
  // Who rents and pays from their wallet.
  client: Session;
}

const departureOf = (ctx: SeedContext, spec: SeedRental): string =>
  guatemalaDateTime(addDays(ctx.today, spec.daysAhead), spec.departureHour);

const returnOf = (ctx: SeedContext, spec: SeedRental): string =>
  new Date(Date.parse(departureOf(ctx, spec)) + spec.returnsAfterHours * HOUR_MS).toISOString();

const trip = (ctx: SeedContext, spec: SeedRental) => ({
  originLabel: spec.origin,
  destinationLabel: spec.destination,
  departureAt: departureOf(ctx, spec),
  returnAt: returnOf(ctx, spec),
  passengers: spec.passengers,
  distanceKm: spec.distanceKm,
});

// A rental has no key of its own: the same person asking for the same trip is the same rental,
// whatever day the seed runs.
async function findRental(
  ctx: SeedContext,
  spec: SeedRental,
  actors: Actors,
): Promise<Rental | undefined> {
  const online = spec.channel === 'ONLINE';
  const found = await ctx.client.request(
    actors.asker,
    'GET',
    withQuery(`${CLIENTES}/${online ? 'rentals/mine' : 'branch-rentals'}`, {
      ...PAGE,
      status: 'all',
      q: spec.destination,
    }),
    undefined,
    rentalPageSchema,
  );
  return found.items.find(
    (rental) =>
      rental.originLabel === spec.origin &&
      rental.destinationLabel === spec.destination &&
      rental.passengers === spec.passengers &&
      rental.clientId === actors.client.user.id,
  );
}

async function create(
  ctx: SeedContext,
  spec: SeedRental,
  actors: Actors,
  branchId: string,
): Promise<Rental> {
  if (spec.channel === 'ONLINE') {
    return ctx.client.request(
      actors.asker,
      'POST',
      `${CLIENTES}/rentals`,
      { branchId, ...trip(ctx, spec) },
      rentalSchema,
    );
  }
  const estimate = await ctx.client.request(
    actors.admin,
    'GET',
    withQuery(`${CLIENTES}/rentals/estimate`, { distanceKm: spec.distanceKm }),
    undefined,
    rentalEstimateSchema,
  );
  return ctx.client.request(
    actors.admin,
    'POST',
    `${CLIENTES}/branch-rentals`,
    {
      branchId,
      ...trip(ctx, spec),
      clientId: actors.client.user.id,
      price: estimate.estimatedPrice,
    },
    rentalSchema,
  );
}

async function pay(
  ctx: SeedContext,
  tally: Tally,
  actors: Actors,
  rental: Rental,
): Promise<Rental> {
  if (await ensureBalance(ctx, actors.client, actors.client.user.email, rental.price ?? 0)) {
    tally.created('top-ups');
  }
  const paid = await ctx.client.request(
    actors.client,
    'POST',
    `${CLIENTES}/rentals/${rental.id}/pay`,
    { paidOn: paidOnFor(ctx.today, rental.id) },
    rentalSchema,
    { [IDEMPOTENCY_KEY]: rental.id },
  );
  tally.created('payments');
  return paid;
}

// The request that viajes makes from the payment, which may not be there yet.
const requestOf = (ctx: SeedContext, admin: Session, spec: SeedRental, id: string) =>
  untilRegistered(
    async () => {
      const found = await ctx.client.request(
        admin,
        'GET',
        withQuery(`${VIAJES}/rental-requests`, {
          ...PAGE,
          status: 'all',
          q: spec.destination,
        }),
        undefined,
        rentalRequestPageSchema,
      );
      const request = found.items.find((candidate) => candidate.id === id);
      if (!request) throw new GatewayError(404, STILL_PAYING);
      return request;
    },
    { ...ctx.retry, isPending: PAYMENT_PENDING },
  );

// Tries the buses of the branch one after another until one is free and takes the rental.
async function assign(
  ctx: SeedContext,
  tally: Tally,
  admin: Session,
  request: RentalToAssign,
): Promise<void> {
  const { buses } = await loadFleet(ctx, admin);
  const travelMs = Math.ceil((request.distanceKm / CRUISE_KM_PER_HOUR) * HOUR_MS);
  const arrival = Math.max(
    Date.parse(request.departureAt) + travelMs,
    request.returnAt ? Date.parse(request.returnAt) : 0,
  );
  for (const bus of buses) {
    try {
      await untilRegistered(
        () =>
          ctx.client.request(admin, 'POST', `${VIAJES}/rental-requests/${request.id}/assignment`, {
            busId: bus.id,
            driverId: bus.assignedDriverId,
            estimatedArrivalAt: new Date(arrival).toISOString(),
          }),
        { ...ctx.retry, isPending: isPendingRegistration },
      );
      tally.created('assignments');
      return;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  tally.skipped('assignments');
  ctx.log(`No bus was free for the rental to ${request.destinationLabel}`);
}

// Takes a rental from where it is to where its target says, one step at a time. Every step looks
// at the state first, so a run that stopped halfway, or a second run, does what is left and no more.
async function advance(
  ctx: SeedContext,
  tally: Tally,
  spec: SeedRental,
  actors: Actors,
  first: Rental,
): Promise<void> {
  let rental = first;
  if (spec.target === 'CANCELLED') {
    if (rental.status === 'REQUESTED' || rental.status === 'CONFIRMED') {
      await ctx.client.request(actors.asker, 'POST', `${CLIENTES}/rentals/${rental.id}/cancel`);
      tally.created('cancellations');
    }
    return;
  }
  if (rental.status === 'REQUESTED' && spec.target !== 'REQUESTED') {
    rental = await ctx.client.request(
      actors.admin,
      'POST',
      `${CLIENTES}/branch-rentals/${rental.id}/confirm`,
      { price: rental.estimatedPrice },
      rentalSchema,
    );
    tally.created('confirmations');
  }
  if (rental.status === 'CONFIRMED' && !['REQUESTED', 'CONFIRMED'].includes(spec.target)) {
    rental = await pay(ctx, tally, actors, rental);
  }
  if (rental.status === 'CANCELLED') {
    // Cancelled is where the rental that is cancelled after paying ends; anything else was cancelled by someone.
    if (spec.target !== 'CANCELLED_AFTER_PAYMENT') tally.skipped('rentals');
    return;
  }
  if (spec.target !== 'ASSIGNED' && spec.target !== 'CANCELLED_AFTER_PAYMENT') return;

  const request = await requestOf(ctx, actors.admin, spec, rental.id);
  if (request.status === 'PENDING') await assign(ctx, tally, actors.admin, request);
  if (spec.target === 'CANCELLED_AFTER_PAYMENT' && request.status !== 'CANCELLED') {
    await untilRegistered(
      () =>
        ctx.client.request(actors.admin, 'POST', `${VIAJES}/rental-requests/${rental.id}/cancel`),
      { ...ctx.retry, isPending: PAYMENT_PENDING },
    );
    tally.created('cancellations');
  }
}

async function actorsOf(ctx: SeedContext, spec: SeedRental): Promise<Actors> {
  const admin = await branchAdminSession(ctx, spec.branch);
  const client = await clientSession(ctx, seedClient(spec.client));
  return { admin, asker: spec.channel === 'COUNTER' ? admin : client, client };
}

// Rentals of buses at every stage: asked for, priced, paid, with their bus, and cancelled before
// and after paying. All are paid from the wallets of the clients of the demo; some are asked for
// online and the others are agreed at the counter by the branch admin.
async function runRentals(ctx: SeedContext) {
  const tally = new Tally('rentals');
  const branchIds = await resolveBranchIds(ctx);
  for (const spec of SEED_RENTALS) {
    const branchId = branchIds.get(spec.branch);
    if (!branchId) throw new Error(`The branch ${spec.branch} does not exist`);
    const actors = await actorsOf(ctx, spec);
    let rental = await findRental(ctx, spec, actors);
    if (rental) {
      tally.existing('rentals');
    } else {
      rental = await create(ctx, spec, actors, branchId);
      tally.created('rentals');
    }
    await advance(ctx, tally, spec, actors, rental);
  }
  return tally.report();
}

export const rentalsArea: SeedArea = { name: 'rentals', owner: 'roberto', run: runRentals };
