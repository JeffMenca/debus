import {
  availableTripPageSchema,
  purchaseSchema,
  ticketSchema,
  type AvailableTrip,
  type Purchase,
} from '@debus/contracts';
import { IDEMPOTENCY_KEY, VENTAS, withQuery } from '../api';
import { ensureSignedIn } from '../accounts';
import type { SeedArea } from '../areas';
import { SEED_BRANCHES, cashierEmail } from '../catalog';
import { seedClient } from '../clients-catalog';
import type { SeedContext } from '../context';
import { addDays, paidOnFor } from '../dates';
import { seedEmail } from '../emails';
import { GatewayError, type Session } from '../gateway-client';
import { Tally } from '../report';
import { pendingCopy, sleep, untilRegistered } from '../retry';
import { clientSession } from './client-accounts';
import { ensureBalance } from './client-wallet';
import { SALE_FROM_DAYS_AHEAD, planSales, type PlannedSale } from './sales-plan';

const ONLINE = 'online tickets';
const COUNTER = 'counter tickets';
// How many times a purchase in doubt is read before leaving it to the recovery job.
const SETTLE_ATTEMPTS = 15;
const SETTLE_DELAY_MS = 2_000;
// The clocks of the services and of this machine may differ a little.
const CLOCK_SKEW_MS = 5_000;
const WALK_IN_LABEL = 'ventanilla';

// The account of the buyer is prepared by an event after it is activated.
const ACCOUNT_PENDING = pendingCopy('Estamos terminando de preparar tu cuenta');

const isRefusal = (error: unknown): error is GatewayError =>
  error instanceof GatewayError && (error.status === 409 || error.status === 422);

// Every trip on sale that leaves far enough ahead for the sale to survive the next load.
async function tripsOnSale(ctx: SeedContext): Promise<AvailableTrip[]> {
  const trips: AvailableTrip[] = [];
  for (let page = 1; ; page++) {
    const result = await ctx.client.request(
      ctx.admin,
      'GET',
      withQuery(`${VENTAS}/trips`, {
        page,
        pageSize: 100,
        from: addDays(ctx.today, SALE_FROM_DAYS_AHEAD),
        to: addDays(ctx.today, ctx.daysAhead),
      }),
      undefined,
      availableTripPageSchema,
    );
    trips.push(...result.items);
    if (result.items.length === 0 || page * result.pageSize >= result.total) return trips;
  }
}

async function readPurchase(
  ctx: SeedContext,
  session: Session,
  ticketId: string,
): Promise<Purchase | null> {
  try {
    return await ctx.client.request(
      session,
      'GET',
      `${VENTAS}/purchases/${ticketId}`,
      undefined,
      purchaseSchema,
    );
  } catch (error) {
    if (error instanceof GatewayError && error.status === 404) return null;
    throw error;
  }
}

// A purchase in doubt gets its answer when the wallet does; the recovery job settles what is left.
async function settled(ctx: SeedContext, session: Session, purchase: Purchase): Promise<Purchase> {
  let current = purchase;
  for (let attempt = 1; current.status === 'PENDING' && attempt <= SETTLE_ATTEMPTS; attempt++) {
    await sleep(ctx.retry.delayMs ?? SETTLE_DELAY_MS);
    current = (await readPurchase(ctx, session, purchase.ticketId)) ?? current;
  }
  return current;
}

function count(tally: Tally, ctx: SeedContext, sale: PlannedSale, purchase: Purchase): void {
  if (purchase.status === 'CONFIRMED') return tally.created(ONLINE);
  tally.skipped(ONLINE);
  ctx.log(`The ticket ${sale.ticketId} is ${purchase.status}: ${purchase.message ?? ''}`);
}

async function sellOnline(ctx: SeedContext, tally: Tally, sale: PlannedSale): Promise<void> {
  if (sale.buyer.kind !== 'client') return;
  const session = await clientSession(ctx, seedClient(sale.buyer.number));
  const known = await readPurchase(ctx, session, sale.ticketId);
  if (known) {
    if (known.status === 'FAILED') {
      tally.skipped(ONLINE);
      ctx.log(`The ticket ${sale.ticketId} failed before: ${known.message ?? ''}`);
    } else if ((await settled(ctx, session, known)).status === 'CONFIRMED') {
      tally.existing(ONLINE);
    } else {
      tally.skipped(ONLINE);
    }
    return;
  }
  const topped = await ensureBalance(
    ctx,
    session,
    session.user.email,
    sale.trip.ticketPrice * sale.seats.length,
  );
  if (topped) tally.created('top-ups');
  try {
    const purchase = await untilRegistered(
      () =>
        ctx.client.request(
          session,
          'POST',
          `${VENTAS}/purchases`,
          {
            tripId: sale.trip.tripId,
            seats: sale.seats,
            paidOn: paidOnFor(ctx.today, sale.ticketId),
          },
          purchaseSchema,
          { [IDEMPOTENCY_KEY]: sale.ticketId },
        ),
      { ...ctx.retry, isPending: ACCOUNT_PENDING },
    );
    count(tally, ctx, sale, await settled(ctx, session, purchase));
  } catch (error) {
    if (!isRefusal(error)) throw error;
    tally.skipped(ONLINE);
    ctx.log(`The ticket ${sale.ticketId} was not sold: ${error.message}`);
  }
}

async function cashierOf(
  ctx: SeedContext,
  cashiers: Map<string, Session>,
  code: string,
): Promise<Session> {
  const known = cashiers.get(code);
  if (known) return known;
  const session = await ensureSignedIn(
    ctx.client,
    ctx.mailbox,
    cashierEmail(ctx.emailBase, code),
    ctx.password,
  );
  cashiers.set(code, session);
  return session;
}

function counterBody(ctx: SeedContext, sale: PlannedSale) {
  const base = {
    tripId: sale.trip.tripId,
    seats: sale.seats,
    paidOn: paidOnFor(ctx.today, sale.ticketId),
  };
  if (sale.buyer.kind === 'client') {
    const client = seedClient(sale.buyer.number);
    return { ...base, nit: client.nit, buyerName: client.fullName };
  }
  return {
    ...base,
    ...(sale.buyer.name && { buyerName: sale.buyer.name }),
    ...(sale.buyer.withEmail && { email: seedEmail(ctx.emailBase, WALK_IN_LABEL) }),
  };
}

// The counter has no way to ask whether a ticket exists, but repeating a sale with the same key
// answers the ticket again: it was just sold when its time is later than the start of this run.
async function sellAtCounter(
  ctx: SeedContext,
  tally: Tally,
  cashiers: Map<string, Session>,
  sale: PlannedSale,
  startedAt: number,
): Promise<void> {
  const code = SEED_BRANCHES.find((branch) => branch.name === sale.trip.originLabel)?.code;
  if (!code) {
    tally.skipped(COUNTER);
    return;
  }
  const cashier = await cashierOf(ctx, cashiers, code);
  try {
    const ticket = await ctx.client.request(
      cashier,
      'POST',
      `${VENTAS}/counter/tickets`,
      counterBody(ctx, sale),
      ticketSchema,
      { [IDEMPOTENCY_KEY]: sale.ticketId },
    );
    if (Date.parse(ticket.soldAt) >= startedAt - CLOCK_SKEW_MS) tally.created(COUNTER);
    else tally.existing(COUNTER);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    tally.skipped(COUNTER);
    ctx.log(`The counter ticket ${sale.ticketId} was not sold: ${error.message}`);
  }
}

// Tickets for the trips of the coming days, bought online by the clients of the demo and sold by
// the cashiers at the counter. Every sale has an id that comes from its trip and channel, so a
// second run finds them all and sells nothing.
async function runSales(ctx: SeedContext) {
  const tally = new Tally('sales');
  if (ctx.daysAhead < SALE_FROM_DAYS_AHEAD) {
    ctx.log(
      `Nothing to sell: tickets are sold for trips ${SALE_FROM_DAYS_AHEAD} or more days ahead and --days-ahead is ${ctx.daysAhead}`,
    );
    return tally.report();
  }
  const startedAt = ctx.now().getTime();
  const cashiers = new Map<string, Session>();
  const trips = await tripsOnSale(ctx);
  if (trips.length === 0) {
    ctx.log('No trips are on sale for those days: run the operations area first');
    return tally.report();
  }
  const plan = planSales(trips, { today: ctx.today });
  ctx.log(`Sales: ${plan.length} tickets planned`);
  for (const sale of plan) {
    if (sale.channel === 'ONLINE') await sellOnline(ctx, tally, sale);
    else await sellAtCounter(ctx, tally, cashiers, sale, startedAt);
  }
  return tally.report();
}

export const salesArea: SeedArea = { name: 'sales', owner: 'roberto', run: runSales };
