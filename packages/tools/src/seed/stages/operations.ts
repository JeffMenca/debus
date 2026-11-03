import {
  expenseCategoryPageSchema,
  expenseCategorySchema,
  guatemalaDateTime,
  repairExpensePageSchema,
  repairExpenseSchema,
  tripDetailSchema,
  tripPageSchema,
  tripSchema,
  type Route,
  type Trip,
  type TripDetail,
} from '@debus/contracts';
import { ADMINISTRACION, PAGE, VIAJES, withQuery } from '../api';
import { EXPENSE_CATEGORIES, SEED_BRANCHES, repairsFor, routesFrom } from '../catalog';
import type { SeedContext } from '../context';
import { HOUR_MS, MINUTE_MS, addDays } from '../dates';
import type { Session } from '../gateway-client';
import { uuidFrom } from '../ids';
import { Tally, type SeedReport } from '../report';
import { STILL_REGISTERING, isConflict, pendingCopy, untilRegistered } from '../retry';
import { CRUISE_KM_PER_HOUR, branchAdminSession, loadFleet, resolveBranchIds } from './shared';
import type { BranchFleet, FleetBus } from './shared';

const SLOTS = ['06:00', '14:00'] as const;
// How long a regular trip takes, for the estimated arrival of the trips scheduled ahead.
// The trip of the day is scheduled a moment ahead, since the API refuses the past, and then its
// departure and arrival are recorded as having happened earlier today, inside the 12 hour tolerance.
const SCHEDULE_AHEAD_MS = 3 * MINUTE_MS;
const DEPARTED_AGO_MS = 3 * HOUR_MS;
const ARRIVED_AGO_MS = MINUTE_MS;
// Short, so the trip of the day does not collide with the trips already scheduled for that day.
const TODAY_TRIP_MS = 45 * MINUTE_MS;
const FUEL_COST_PER_KM = 1.8;

// Copies that the owning service sends by event may be a few seconds behind.
const COPY_PENDING = pendingCopy(
  STILL_REGISTERING,
  'Aún no tenemos',
  'Aún no hay monto de depreciación',
);
const BUS_COPY_PENDING = pendingCopy('No encontramos ese bus en tu sucursal.');

const cents = (amount: number): number => Math.round(amount * 100) / 100;
const hours = (distanceKm: number): number => distanceKm / CRUISE_KM_PER_HOUR;

async function tripsOf(ctx: SeedContext, session: Session, day: string): Promise<Trip[]> {
  const page = await ctx.client.request(
    session,
    'GET',
    withQuery(`${VIAJES}/trips`, { ...PAGE, from: day, to: day }),
    undefined,
    tripPageSchema,
  );
  return page.items;
}

function scheduleTrip(
  ctx: SeedContext,
  session: Session,
  bus: FleetBus,
  route: Route,
  departureAt: string,
  estimatedArrivalAt: string,
): Promise<Trip> {
  return untilRegistered(
    () =>
      ctx.client.request(
        session,
        'POST',
        `${VIAJES}/trips`,
        {
          routeId: route.id,
          busId: bus.id,
          driverId: bus.assignedDriverId,
          departureAt,
          estimatedArrivalAt,
        },
        tripSchema,
      ),
    ctx.retry,
  );
}

// Tries the buses one after another: a bus that is busy or whose driver cannot take the trip does
// not stop the others. Returns false when none could.
async function scheduleOnAny(
  ctx: SeedContext,
  session: Session,
  fleet: BranchFleet,
  route: Route,
  departureAt: string,
  firstBus: number,
): Promise<boolean> {
  const estimatedArrivalAt = new Date(
    Date.parse(departureAt) + Math.ceil(hours(route.distanceKm) * 60) * MINUTE_MS,
  ).toISOString();
  for (let step = 0; step < fleet.buses.length; step++) {
    const bus = fleet.buses[(firstBus + step) % fleet.buses.length];
    if (!bus) continue;
    try {
      await scheduleTrip(ctx, session, bus, route, departureAt, estimatedArrivalAt);
      return true;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  return false;
}

// Every page of the scheduled trips in a range, read before anything is deleted so the pages do not move.
async function scheduledTrips(
  ctx: SeedContext,
  session: Session,
  range: { from?: string; to: string },
): Promise<Trip[]> {
  const trips: Trip[] = [];
  for (let page = 1; ; page++) {
    const result = await ctx.client.request(
      session,
      'GET',
      withQuery(`${VIAJES}/trips`, { ...PAGE, page, ...range, status: 'SCHEDULED' }),
      undefined,
      tripPageSchema,
    );
    trips.push(...result.items);
    if (result.items.length === 0 || page * result.pageSize >= result.total) return trips;
  }
}

// Guatemala is always UTC-6, so the hour of a slot is the same all year.
const GUATEMALA_UTC_OFFSET_HOURS = 6;
const SLOT_HOURS = new Set(SLOTS.map((slot) => Number(slot.slice(0, 2))));
const isSlot = (departureAt: string): boolean => {
  const at = new Date(departureAt);
  const hour = (at.getUTCHours() - GUATEMALA_UTC_OFFSET_HOURS + 24) % 24;
  return SLOT_HOURS.has(hour) && at.getUTCMinutes() === 0;
};

// A trip nobody ran stays "scheduled" in the past for good, and it would show as a trip that never
// happened. The ones the seed scheduled (regular trips at its hours on its routes) whose time has
// passed are removed, which the API allows while they have not left. Rentals and anything somebody
// scheduled by hand are never touched.
async function removePastTrips(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  fleet: BranchFleet,
  code: string,
): Promise<void> {
  const kind = 'past trips';
  const destinations = new Set(routesFrom(code).map((route) => ctx.branchIds.get(route.to)));
  const routeIds = new Set(
    fleet.routes
      .filter((route) => destinations.has(route.destinationBranchId))
      .map((route) => route.id),
  );
  const removable = (trip: Trip): boolean =>
    trip.type === 'REGULAR' &&
    trip.routeId !== null &&
    routeIds.has(trip.routeId) &&
    isSlot(trip.departureAt) &&
    Date.parse(trip.departureAt) < ctx.now().getTime();
  const earlier = await scheduledTrips(ctx, session, { to: addDays(ctx.today, -1) });
  const today = await scheduledTrips(ctx, session, { from: ctx.today, to: ctx.today });
  for (const trip of [...earlier, ...today].filter(removable)) {
    await removeTrip(ctx, tally, session, trip, kind);
  }
}

async function removeTrip(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  trip: Trip,
  kind: string,
): Promise<void> {
  try {
    await ctx.client.request(session, 'DELETE', `${VIAJES}/trips/${trip.id}`);
    tally.removed(kind);
  } catch (error) {
    if (!isConflict(error)) throw error;
    tally.skipped(kind);
    ctx.log(
      `The trip of ${trip.originName} to ${trip.destinationName} could not be removed: ${error.message}`,
    );
  }
}

// Two trips a day on every route for the coming days, so the sales screens have something to sell.
async function scheduleAhead(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  fleet: BranchFleet,
): Promise<void> {
  for (let ahead = 1; ahead <= ctx.daysAhead; ahead++) {
    const day = addDays(ctx.today, ahead);
    const known = await tripsOf(ctx, session, day);
    for (const [slot, time] of SLOTS.entries()) {
      const departureAt = guatemalaDateTime(day, time);
      for (const [index, route] of fleet.routes.entries()) {
        const exists = known.some(
          (trip) =>
            trip.routeId === route.id && Date.parse(trip.departureAt) === Date.parse(departureAt),
        );
        if (exists) {
          tally.existing('trips');
          continue;
        }
        const firstBus = slot * fleet.routes.length + index;
        if (await scheduleOnAny(ctx, session, fleet, route, departureAt, firstBus)) {
          tally.created('trips');
        } else {
          tally.skipped('trips');
          ctx.log(
            `No bus was free for ${route.originName} to ${route.destinationName} on ${day} at ${time}`,
          );
        }
      }
    }
  }
}

const getDetail = (ctx: SeedContext, session: Session, tripId: string): Promise<TripDetail> =>
  ctx.client.request(session, 'GET', `${VIAJES}/trips/${tripId}`, undefined, tripDetailSchema);

async function recordArrival(
  ctx: SeedContext,
  session: Session,
  tripId: string,
  detail: TripDetail,
): Promise<void> {
  const distanceKm = detail.distanceKm ?? 0;
  const startMileageKm = detail.departure?.startMileageKm ?? detail.suggestedStartMileageKm;
  await untilRegistered(
    () =>
      ctx.client.request(session, 'POST', `${VIAJES}/trips/${tripId}/arrival`, {
        arrivedAt: new Date(ctx.now().getTime() - ARRIVED_AGO_MS).toISOString(),
        endMileageKm: Math.round(startMileageKm + distanceKm),
        fuelCost: cents(distanceKm * FUEL_COST_PER_KM),
      }),
    { ...ctx.retry, isPending: COPY_PENDING },
  );
}

async function runTripOfTheDay(
  ctx: SeedContext,
  session: Session,
  bus: FleetBus,
  route: Route,
): Promise<boolean> {
  const now = ctx.now().getTime();
  // Three hours ago may still be yesterday in Guatemala; the trip of the day belongs to today.
  const dayStart = Date.parse(guatemalaDateTime(ctx.today, '00:00'));
  const departedAt = Math.max(now - DEPARTED_AGO_MS, dayStart + MINUTE_MS);
  // Nothing fits between the start of the day and now: better no trip than one that ends before it starts.
  if (now - ARRIVED_AGO_MS <= departedAt) return false;
  const departureAt = new Date(now + SCHEDULE_AHEAD_MS).toISOString();
  const estimatedArrivalAt = new Date(now + SCHEDULE_AHEAD_MS + TODAY_TRIP_MS).toISOString();
  let trip: Trip;
  try {
    trip = await scheduleTrip(ctx, session, bus, route, departureAt, estimatedArrivalAt);
  } catch (error) {
    if (isConflict(error)) return false;
    throw error;
  }
  const detail = await getDetail(ctx, session, trip.id);
  const departed = await untilRegistered(
    () =>
      ctx.client.request(
        session,
        'POST',
        `${VIAJES}/trips/${trip.id}/departure`,
        {
          departedAt: new Date(departedAt).toISOString(),
          startMileageKm: detail.suggestedStartMileageKm,
        },
        tripDetailSchema,
      ),
    { ...ctx.retry, isPending: COPY_PENDING },
  );
  await recordArrival(ctx, session, trip.id, departed);
  return true;
}

// Every bus with a driver completes one trip today, so the reports of the day have data.
async function completeToday(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  fleet: BranchFleet,
): Promise<void> {
  const kind = 'trips today';
  const today = await tripsOf(ctx, session, ctx.today);
  for (const [index, bus] of fleet.buses.entries()) {
    const own = today.filter((trip) => trip.busId === bus.id);
    const onTheRoad = own.find((trip) => trip.status === 'IN_TRANSIT');
    const route = fleet.routes[index % Math.max(fleet.routes.length, 1)];
    if (own.some((trip) => trip.status === 'COMPLETED')) {
      tally.existing(kind);
    } else if (onTheRoad) {
      await recordArrival(ctx, session, onTheRoad.id, await getDetail(ctx, session, onTheRoad.id));
      tally.created(kind);
    } else if (route && (await runTripOfTheDay(ctx, session, bus, route))) {
      tally.created(kind);
    } else {
      tally.skipped(kind);
      ctx.log(`The bus ${bus.plate} could not take a trip today`);
    }
  }
}

type CategoryIds = Map<string, string>;

// The catalog is the system admin's to manage and may have changed since the migration filled it:
// a category the repairs use is reactivated if someone turned it off, or created again if deleted.
// The branch admin reads; the system admin only steps in when something has to be fixed.
async function ensureCategories(ctx: SeedContext, session: Session): Promise<CategoryIds> {
  const categories = await ctx.client.request(
    session,
    'GET',
    withQuery(`${ADMINISTRACION}/expense-categories`, { ...PAGE, status: 'all' }),
    undefined,
    expenseCategoryPageSchema,
  );
  const ids: CategoryIds = new Map();
  for (const name of EXPENSE_CATEGORIES) {
    const found = categories.items.find((category) => category.name === name);
    if (found && !found.active) {
      await ctx.client.request(
        ctx.admin,
        'PATCH',
        `${ADMINISTRACION}/expense-categories/${found.id}`,
        { active: true },
        expenseCategorySchema,
      );
      ctx.log(`Reactivated the expense category ${name}`);
    }
    const id =
      found?.id ??
      (
        await ctx.client.request(
          ctx.admin,
          'POST',
          `${ADMINISTRACION}/expense-categories`,
          { name },
          expenseCategorySchema,
        )
      ).id;
    if (!found) ctx.log(`Created the expense category ${name}`);
    ids.set(name, id);
  }
  return ids;
}

// One or two repairs per bus, dated in the past: workshop expenses are recorded after the fact.
async function addRepairs(
  ctx: SeedContext,
  tally: Tally,
  session: Session,
  fleet: BranchFleet,
  categoryIds: CategoryIds,
): Promise<void> {
  const categoryId = (name: string): string => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`The expense category ${name} is not in the seed catalog`);
    return id;
  };
  for (const [number, bus] of fleet.buses.entries()) {
    const saved = await ctx.client.request(
      session,
      'GET',
      withQuery(`${ADMINISTRACION}/repair-expenses`, { page: 1, pageSize: 1, busId: bus.id }),
      undefined,
      repairExpensePageSchema,
    );
    if (saved.total > 0) {
      tally.existing('repairs', saved.total);
      continue;
    }
    for (const [position, plan] of repairsFor(number).entries()) {
      const body = {
        id: uuidFrom(`repair:${bus.id}:${position}`),
        busId: bus.id,
        serviceDate: addDays(ctx.today, -plan.daysAgo),
        lines: plan.lines.map((line) => ({
          categoryId: categoryId(line.category),
          kind: line.kind,
          description: line.description,
          amount: line.amount,
        })),
      };
      await untilRegistered(
        () =>
          ctx.client.request(
            session,
            'POST',
            `${ADMINISTRACION}/repair-expenses`,
            body,
            repairExpenseSchema,
          ),
        { ...ctx.retry, isPending: BUS_COPY_PENDING },
      );
      tally.created('repairs');
    }
  }
}

// What a branch does day to day: trips scheduled ahead, the trip each bus ran today and the
// workshop expenses of the past weeks. Running it again on the same day changes nothing.
export async function runOperations(ctx: SeedContext): Promise<SeedReport> {
  const tally = new Tally('operations');
  await resolveBranchIds(ctx);
  let categoryIds: CategoryIds | undefined;
  for (const { code } of SEED_BRANCHES) {
    const session = await branchAdminSession(ctx, code);
    categoryIds ??= await ensureCategories(ctx, session);
    const fleet = await loadFleet(ctx, session);
    ctx.log(`Operations of ${code}: ${fleet.buses.length} buses, ${fleet.routes.length} routes`);
    await removePastTrips(ctx, tally, session, fleet, code);
    await scheduleAhead(ctx, tally, session, fleet);
    await completeToday(ctx, tally, session, fleet);
    await addRepairs(ctx, tally, session, fleet, categoryIds);
  }
  return tally.report();
}
