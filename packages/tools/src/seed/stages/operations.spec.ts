import { GatewayError } from '../gateway-client';
import { SEED_BRANCHES, SEED_ROUTES, busesFor } from '../catalog';
import type { RecordedRequest } from '../testing/fake-gateway';
import { NOW, TODAY, setup } from '../testing/setup';
import { runFleet } from './fleet';
import { runOperations } from './operations';
import { runStructure } from './structure';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const BUSES = SEED_BRANCHES.flatMap((branch) => busesFor(branch.code)).length;

async function ready(now: Date = NOW, today: string = TODAY) {
  const world = setup(now, today);
  await runStructure(world.ctx);
  await runFleet(world.ctx);
  return world;
}
const tripPosts = (requests: RecordedRequest[]) =>
  requests.filter((request) => request.method === 'POST' && request.path === '/api/viajes/trips');
const writes = (requests: { method: string }[]) =>
  requests.filter((request) => request.method === 'POST').length;

describe('runOperations', () => {
  it('leaves each route a trip at 06:00 and one at 14:00 for each of the next days', async () => {
    const { gateway, ctx } = await ready();
    const report = await runOperations(ctx);
    const future = gateway.trips.filter((trip) => trip.status === 'SCHEDULED');
    expect(future).toHaveLength(SEED_ROUTES.length * 2 * 7);
    expect(report.counts.trips).toEqual({ created: future.length, existing: 0 });
    const hours = new Set(future.map((trip) => String(trip.departureAt).slice(11, 16)));
    expect(hours).toEqual(new Set(['12:00', '20:00'])); // 06:00 and 14:00 in Guatemala, as UTC
    const days = new Set(future.map((trip) => String(trip.departureAt).slice(0, 10)));
    expect(days.size).toBe(7);
    expect(days.has(TODAY)).toBe(false);
  });

  it('respects days ahead', async () => {
    const { gateway, ctx } = await ready();
    ctx.daysAhead = 2;
    await runOperations(ctx);
    expect(gateway.trips.filter((trip) => trip.status === 'SCHEDULED')).toHaveLength(
      SEED_ROUTES.length * 2 * 2,
    );
  });

  it('never schedules in the past', async () => {
    const { gateway, ctx } = await ready();
    await runOperations(ctx);
    for (const request of tripPosts(gateway.requests)) {
      const { departureAt, estimatedArrivalAt } = request.body as {
        departureAt: string;
        estimatedArrivalAt: string;
      };
      expect(Date.parse(departureAt)).toBeGreaterThan(NOW.getTime());
      expect(Date.parse(estimatedArrivalAt)).toBeGreaterThan(Date.parse(departureAt));
    }
  });

  describe("today's completed trips", () => {
    it('completes one trip for every bus', async () => {
      const { gateway, ctx } = await ready();
      const report = await runOperations(ctx);
      const done = gateway.trips.filter((trip) => trip.status === 'COMPLETED');
      expect(done).toHaveLength(BUSES);
      expect(new Set(done.map((trip) => trip.busId)).size).toBe(BUSES);
      expect(report.counts['trips today']).toEqual({ created: BUSES, existing: 0 });
    });

    it('records the departure 3 hours ago and the arrival 1 minute ago', async () => {
      const { gateway, ctx } = await ready();
      await runOperations(ctx);
      const trip = gateway.trips.find((candidate) => candidate.status === 'COMPLETED');
      const departure = trip?.departure as Record<string, unknown>;
      const arrival = trip?.arrival as Record<string, unknown>;
      expect(Date.parse(departure.departedAt as string)).toBe(NOW.getTime() - 3 * HOUR);
      expect(Date.parse(arrival.arrivedAt as string)).toBe(NOW.getTime() - MINUTE);
    });

    it('starts from the kilometres the bus has and adds the distance of the route', async () => {
      const { gateway, ctx } = await ready();
      const kmBefore = new Map(gateway.buses.map((bus) => [bus.id, bus.mileageKm as number]));
      await runOperations(ctx);
      const trip = gateway.trips.find((candidate) => candidate.status === 'COMPLETED');
      const route = gateway.routes.find((candidate) => candidate.id === trip?.routeId);
      const departure = trip?.departure as Record<string, number>;
      const arrival = trip?.arrival as Record<string, number>;
      expect(departure.startMileageKm).toBe(kmBefore.get(String(trip?.busId)));
      expect(arrival.endMileageKm).toBe(
        (departure.startMileageKm as number) + (route?.distanceKm as number),
      );
      expect(arrival.fuelCost).toBeCloseTo((route?.distanceKm as number) * 1.8, 2);
    });

    it('records the departure before the arrival of each trip', async () => {
      const { gateway, ctx } = await ready();
      await runOperations(ctx);
      const trip = gateway.trips.find((candidate) => candidate.status === 'COMPLETED');
      const order = gateway.requests
        .filter((request) => request.path.startsWith(`/api/viajes/trips/${trip?.id}`))
        .map((request) => `${request.method} ${request.path.split('/').slice(5).join('/')}`);
      expect(order).toEqual(['GET ', 'POST departure', 'POST arrival']);
    });

    it('waits while the departure or the arrival depends on a copy that has not arrived', async () => {
      const { gateway, ctx } = await ready();
      gateway.failNext(
        /POST \/api\/viajes\/trips$/,
        new GatewayError(
          409,
          'Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.',
        ),
        2,
      );
      gateway.failNext(
        /POST \/api\/viajes\/trips\/[^/]+\/arrival/,
        new GatewayError(
          409,
          'Aún no tenemos el salario de ese chofer. Intenta de nuevo en unos segundos.',
        ),
        2,
      );
      await runOperations(ctx);
      expect(gateway.trips.filter((trip) => trip.status === 'COMPLETED')).toHaveLength(BUSES);
    });

    it('finishes a trip that was left on the road by an interrupted run', async () => {
      const { gateway, ctx } = await ready();
      gateway.failNext(
        /POST \/api\/viajes\/trips\/[^/]+\/arrival/,
        new GatewayError(500, 'Algo falló.'),
      );
      await expect(runOperations(ctx)).rejects.toThrow('Algo falló.');
      const stuck = gateway.trips.filter((trip) => trip.status === 'IN_TRANSIT');
      expect(stuck).toHaveLength(1);
      await runOperations(ctx);
      expect(gateway.trips.filter((trip) => trip.status === 'IN_TRANSIT')).toHaveLength(0);
      expect(gateway.trips.filter((trip) => trip.status === 'COMPLETED')).toHaveLength(BUSES);
      const busTrips = gateway.trips.filter((trip) => trip.busId === stuck[0]?.busId);
      expect(busTrips.filter((trip) => String(trip.departureAt).startsWith(TODAY))).toHaveLength(1);
    });

    it('moves on to the next bus when one cannot take the trip right now', async () => {
      const { gateway, ctx } = await ready();
      ctx.daysAhead = 0;
      gateway.failNext(
        /POST \/api\/viajes\/trips$/,
        new GatewayError(409, 'Ese bus ya tiene un viaje en ese horario.'),
        1,
      );
      const report = await runOperations(ctx);
      expect(report.counts['trips today']?.created).toBe(BUSES - 1);
      expect(gateway.trips.filter((trip) => trip.status === 'COMPLETED')).toHaveLength(BUSES - 1);
    });
  });

  describe('when a trip cannot be placed', () => {
    const busy = () => new GatewayError(409, 'Ese bus ya tiene un viaje en ese horario.');

    it('leaves out the trips that no bus can take and says so', async () => {
      const { gateway, ctx } = await ready();
      const log = jest.fn();
      ctx.daysAhead = 1;
      ctx.log = log;
      gateway.failNext(/POST \/api\/viajes\/trips$/, busy(), 10_000);
      const report = await runOperations(ctx);
      expect(report.counts.trips).toEqual({
        created: 0,
        existing: 0,
        skipped: SEED_ROUTES.length * 2,
      });
      expect(report.counts['trips today']).toEqual({ created: 0, existing: 0, skipped: BUSES });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('No bus was free'));
      expect(log).toHaveBeenCalledWith(expect.stringContaining('could not take a trip today'));
    });

    it('stops at an error that is not a conflict when scheduling ahead', async () => {
      const { gateway, ctx } = await ready();
      gateway.failNext(/POST \/api\/viajes\/trips$/, new GatewayError(500, 'Algo falló.'));
      await expect(runOperations(ctx)).rejects.toThrow('Algo falló.');
    });

    it("stops at an error that is not a conflict on the day's trip", async () => {
      const { gateway, ctx } = await ready();
      ctx.daysAhead = 0;
      gateway.failNext(/POST \/api\/viajes\/trips$/, new GatewayError(500, 'Algo falló.'));
      await expect(runOperations(ctx)).rejects.toThrow('Algo falló.');
    });

    it('stops when a copy never arrives instead of passing over the bus', async () => {
      const { gateway, ctx } = await ready();
      ctx.retry = { delayMs: 0, attempts: 2 };
      gateway.failNext(
        /POST \/api\/viajes\/trips$/,
        new GatewayError(
          409,
          'Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.',
        ),
        10,
      );
      await expect(runOperations(ctx)).rejects.toThrow('Estamos terminando de registrar');
    });
  });

  describe('trips left scheduled in the past between two loads', () => {
    const TWO_DAYS_LATER = new Date(NOW.getTime() + 48 * HOUR);

    async function afterTwoDays() {
      const world = await ready();
      await runOperations(world.ctx);
      world.gateway.now = () => TWO_DAYS_LATER;
      const later = { ...world.ctx, now: () => TWO_DAYS_LATER, today: '2026-10-21' };
      return { ...world, later };
    }

    it('removes the scheduled trips whose time has passed', async () => {
      const { gateway, later } = await afterTwoDays();
      const report = await runOperations(later);
      // The two slots of the 20th and the morning slot of the 21st, on every route.
      expect(report.counts['past trips']?.removed).toBe(SEED_ROUTES.length * 3);
      const scheduled = gateway.trips.filter((trip) => trip.status === 'SCHEDULED');
      for (const trip of scheduled) {
        expect(Date.parse(String(trip.departureAt))).toBeGreaterThan(TWO_DAYS_LATER.getTime());
      }
    });

    it('never removes a trip that departed or arrived, whatever its day', async () => {
      const { gateway, later } = await afterTwoDays();
      const done = gateway.trips.filter((trip) => trip.status === 'COMPLETED').length;
      await runOperations(later);
      expect(
        gateway.trips.filter((trip) => trip.status === 'COMPLETED').length,
      ).toBeGreaterThanOrEqual(done);
    });

    it('has nothing to remove the second time', async () => {
      const { gateway, later } = await afterTwoDays();
      await runOperations(later);
      const before = gateway.count('DELETE', /\/api\/viajes\/trips\//);
      const second = await runOperations(later);
      expect(gateway.count('DELETE', /\/api\/viajes\/trips\//)).toBe(before);
      expect(second.counts['past trips']).toBeUndefined();
    });

    it('leaves alone and reports a trip the service will not delete', async () => {
      const { gateway, later } = await afterTwoDays();
      gateway.failNext(
        /DELETE \/api\/viajes\/trips\//,
        new GatewayError(409, 'Este viaje ya tiene boletos vendidos.'),
      );
      const report = await runOperations(later);
      expect(report.counts['past trips']?.skipped).toBe(1);
      expect(report.counts['past trips']?.removed).toBe(SEED_ROUTES.length * 3 - 1);
    });

    it('does not remove a trip scheduled for later today', async () => {
      const { gateway, later } = await afterTwoDays();
      await runOperations(later);
      const afternoon = gateway.trips.filter(
        (trip) => trip.status === 'SCHEDULED' && String(trip.departureAt).startsWith('2026-10-21'),
      );
      expect(afternoon).toHaveLength(SEED_ROUTES.length);
    });
  });

  describe('a load in the first hours of the Guatemalan day', () => {
    // 02:30 in Guatemala: three hours ago was still yesterday.
    const EARLY = new Date('2026-10-19T08:30:00.000Z');

    it('records the departure after the start of the day, so the trip belongs to today', async () => {
      const { gateway, ctx } = await ready(EARLY);
      ctx.daysAhead = 0;
      await runOperations(ctx);
      const done = gateway.trips.filter((trip) => trip.status === 'COMPLETED');
      expect(done).toHaveLength(BUSES);
      for (const trip of done) {
        const departedAt = Date.parse(
          (trip.departure as Record<string, string>).departedAt as string,
        );
        expect(departedAt).toBe(Date.parse('2026-10-19T06:01:00.000Z'));
        expect(Date.parse((trip.arrival as Record<string, string>).arrivedAt as string)).toBe(
          EARLY.getTime() - MINUTE,
        );
      }
    });

    it('does not run the trips of the day when there is no time between midnight and now', async () => {
      const justAfterMidnight = new Date('2026-10-19T06:02:00.000Z');
      const { gateway, ctx } = await ready(justAfterMidnight);
      ctx.daysAhead = 0;
      const report = await runOperations(ctx);
      expect(report.counts['trips today']).toEqual({ created: 0, existing: 0, skipped: BUSES });
      expect(gateway.trips.filter((trip) => trip.status !== 'SCHEDULED')).toHaveLength(0);
    });
  });

  describe('workshop expenses', () => {
    it('gives every bus one or two repairs dated 10 to 60 days ago', async () => {
      const { gateway, ctx } = await ready();
      const report = await runOperations(ctx);
      for (const bus of gateway.buses) {
        const own = gateway.expenses.filter((expense) => expense.busId === bus.id);
        expect(own.length).toBeGreaterThanOrEqual(1);
        expect(own.length).toBeLessThanOrEqual(2);
        for (const expense of own) {
          const age = (Date.parse(TODAY) - Date.parse(String(expense.serviceDate))) / 86_400_000;
          expect(age).toBeGreaterThanOrEqual(10);
          expect(age).toBeLessThanOrEqual(60);
          const lines = expense.lines as { categoryName: string }[];
          expect(lines).toHaveLength(2);
          expect(new Set(lines.map((line) => line.categoryName)).size).toBe(2);
        }
      }
      expect(report.counts.repairs?.created).toBe(gateway.expenses.length);
    });

    it('waits while the bus has not reached the expenses service', async () => {
      const { gateway, ctx } = await ready();
      gateway.failNext(
        /POST \/api\/administracion\/repair-expenses/,
        new GatewayError(409, 'No encontramos ese bus en tu sucursal.'),
        2,
      );
      await runOperations(ctx);
      for (const bus of gateway.buses) {
        expect(gateway.expenses.some((expense) => expense.busId === bus.id)).toBe(true);
      }
    });
  });

  it('creates nothing the second time on the same day', async () => {
    const { gateway, ctx } = await ready();
    await runOperations(ctx);
    const before = writes(gateway.requests);
    const second = await runOperations(ctx);
    expect(writes(gateway.requests)).toBe(before);
    expect(second.counts.trips?.created).toBe(0);
    expect(second.counts['trips today']?.created).toBe(0);
    expect(second.counts.repairs?.created).toBe(0);
    expect(second.counts['trips today']?.existing).toBe(BUSES);
  });

  it('on a later day only adds the new days ahead', async () => {
    const { gateway, ctx } = await ready();
    await runOperations(ctx);
    const later = new Date(NOW.getTime() + 24 * HOUR);
    gateway.now = () => later;
    const report = await runOperations({ ...ctx, now: () => later, today: '2026-10-20' });
    expect(report.counts.trips).toEqual({
      created: SEED_ROUTES.length * 2,
      existing: SEED_ROUTES.length * 2 * 6,
    });
    expect(report.counts.repairs?.created).toBe(0);
  });

  it('does the work as the administrator of each branch', async () => {
    const { gateway, ctx } = await ready();
    const before = gateway.requests.length;
    await runOperations(ctx);
    const emails = new Set(gateway.requests.slice(before).map((request) => request.email));
    expect(emails).toEqual(
      new Set(SEED_BRANCHES.map((branch) => `seed+admin-${branch.code.toLowerCase()}@debus.local`)),
    );
  });
});
